import type { SinglishDB } from '../db/db'
import type { Chunk, Context, Song, TextSource, Word } from '../db/types'
import { filterWordsByBand, loadRanks } from './freq'
import { GeminiError, callGemini } from './gemini/client'
import { parseAnalysis, type Analysis } from './gemini/parse'
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserMessage } from './gemini/prompt'
import { newCardPair } from './scheduler'
import { getSettings } from './settings'
import { normalizeKey, splitLines } from './text'
import { newId } from './id'

export interface SongInput {
  title: string
  artist: string
  spotifyUrl: string | null
  rawText: string
  comprehensionBefore: number | null
  kind?: 'song' | 'text'
  source?: TextSource
}

export async function createSong(db: SinglishDB, input: SongInput, now: Date): Promise<Song> {
  const settings = await getSettings(db)
  const song: Song = {
    id: newId(),
    kind: input.kind ?? 'song',
    ...(input.kind === 'text' ? { source: input.source ?? 'altro' } : {}),
    title: input.title,
    artist: input.artist,
    spotifyUrl: input.spotifyUrl,
    lines: splitLines(input.rawText),
    status: 'draft',
    level: settings.level,
    difficultyKnownPct: null,
    comprehensionBefore: input.comprehensionBefore,
    grammarPoint: null,
    connectedSpeech: [],
    addedAt: now,
    analyzedAt: null,
  }
  await db.songs.add(song)
  return song
}

/** Il verso di una voce; la forma si ricorda solo se lì è diversa da quella della voce. */
export const contextOf = (songId: string, lineIndex: number, surface: string, itemSurface: string): Context =>
  surface && surface !== itemSurface ? { songId, lineIndex, surfaceForm: surface } : { songId, lineIndex }

/** La casa di una voce (canzone e riga) è il suo primo verso: Sessione, Lessico, scheda e card Ascolta lo leggono da lì. */
export const isHome = (item: Chunk | Word): boolean => {
  const first = item.contexts[0]
  return !!first && first.songId === item.songId && first.lineIndex === item.lineIndex
}

/** Una voce di Espandi che compare in un verso diventa una voce di canzone come le altre. */
export function graduate(item: Chunk | Word): void {
  // Anche una voce senza casa (parola del profilo, canzone eliminata, dati vecchi) si sposta sul verso che ha ricevuto.
  if (item.origin !== 'expand' && isHome(item)) return
  delete item.origin
  delete item.fromItemId
  // Canzone, riga e forma passano al verso: Lessico, scheda, card Ascolta e coda la vedono lì.
  const ctx = item.contexts[0]
  if (ctx) {
    item.songId = ctx.songId
    item.lineIndex = ctx.lineIndex
    const old = item.surfaceForm
    if (ctx.surfaceForm) { item.surfaceForm = ctx.surfaceForm; delete ctx.surfaceForm }
    // Gli altri versi senza forma propria valevano per quella vecchia: la ricevono, così restano evidenziati.
    if (item.surfaceForm !== old) for (const x of item.contexts) if (x !== ctx && !x.surfaceForm) x.surfaceForm = old
  }
}

export const addContext = (contexts: Context[], ctx: Context): boolean => {
  const same = contexts.find((c) => c.songId === ctx.songId && c.lineIndex === ctx.lineIndex)
  if (same) {
    // Un contesto salvato prima senza la forma del verso la prende ora.
    if (!ctx.surfaceForm || same.surfaceForm === ctx.surfaceForm) return false
    same.surfaceForm = ctx.surfaceForm
    return true
  }
  contexts.push(ctx)
  return true
}

export async function saveAnalysis(
  db: SinglishDB,
  songId: string,
  analysis: Analysis,
  ranks: Map<string, number>,
  now: Date,
): Promise<{ chunksAdded: number; contextsAdded: number; wordsPending: number }> {
  const settings = await getSettings(db)
  const band: [number, number] = [settings.bandStart, settings.bandEnd]
  return db.transaction('rw', db.songs, db.chunks, db.words, db.cards, async () => {
    const song = await db.songs.get(songId)
    if (!song) throw new Error(`Song not found: ${songId}`)
    // Una seconda analisi della stessa canzone (doppio avvio, coda all'apertura) non tocca nulla.
    if (isAnalyzed(song)) return { chunksAdded: 0, contextsAdded: 0, wordsPending: 0 }
    let chunksAdded = 0
    let contextsAdded = 0

    for (const c of analysis.chunks) {
      const key = normalizeKey(c.base_form)
      const existing = await db.chunks.where('key').equals(key).first()
      if (existing) {
        if (addContext(existing.contexts, contextOf(songId, c.line_index, c.surface_form, existing.surfaceForm))) {
          graduate(existing)
          await db.chunks.put(existing)
          contextsAdded++
        }
        continue
      }
      const chunk: Chunk = {
        id: newId(),
        songId,
        key,
        baseForm: c.base_form,
        surfaceForm: c.surface_form,
        lineIndex: c.line_index,
        contexts: [{ songId, lineIndex: c.line_index }],
        type: c.type,
        cefr: c.cefr,
        register: c.register,
        topic: c.topic,
        meaningIt: c.meaning_it,
        explanationIt: c.explanation_it,
        extraExampleEn: c.extra_example_en,
        productionPromptIt: c.production_prompt_it,
        // Un testo libero non si ascolta cantato: niente nota di pronuncia (e quindi niente card Ascolta).
        pronunciationNoteIt: song.kind === 'text' ? '' : (c.pronunciation_note_it ?? ''),
        userEdited: false,
        suspended: false,
      }
      await db.chunks.add(chunk)
      await db.cards.bulkAdd(newCardPair('chunk', chunk.id, now))
      chunksAdded++
    }

    const known = new Set((await db.words.toArray()).map((w) => w.lemma.toLowerCase()))
    const fresh: ((typeof analysis.words)[number])[] = []
    const extraLines = new Map<string, { line: number; surface: string }[]>()
    for (const raw of analysis.words) {
      const w = { ...raw, lemma: raw.lemma.trim().toLowerCase() }
      const lemma = w.lemma
      if (known.has(lemma)) {
        const existing = await db.words.where('lemma').equals(lemma).first()
        if (existing && addContext(existing.contexts, contextOf(songId, w.line_index, w.surface_form, existing.surfaceForm))) {
          graduate(existing)
          await db.words.put(existing)
        }
      } else if (extraLines.has(lemma)) {
        extraLines.get(lemma)!.push({ line: w.line_index, surface: w.surface_form })
      } else {
        extraLines.set(lemma, [])
        fresh.push(w)
      }
    }
    const accepted = filterWordsByBand(fresh, ranks, band, known)
    const rows: Word[] = accepted.map((w) => ({
      id: newId(),
      lemma: w.lemma,
      surfaceForm: w.surface_form,
      pos: w.pos,
      freqRank: w.freqRank,
      songId,
      lineIndex: w.line_index,
      contexts: (() => {
        const ctxs: Context[] = [{ songId, lineIndex: w.line_index }]
        for (const x of extraLines.get(w.lemma) ?? []) {
          addContext(ctxs, contextOf(songId, x.line, x.surface, w.surface_form))
        }
        return ctxs
      })(),
      cefr: w.cefr,
      register: w.register,
      topic: w.topic,
      meaningIt: w.meaning_it,
      explanationIt: w.explanation_it,
      extraExampleEn: w.extra_example_en,
      triage: 'pending',
      userEdited: false,
      suspended: false,
    }))
    await db.words.bulkAdd(rows)

    await db.songs.update(songId, {
      status: 'analyzed',
      difficultyKnownPct: analysis.difficulty_known_pct,
      grammarPoint: analysis.grammar_point
        ? {
            title: analysis.grammar_point.title,
            explanationIt: analysis.grammar_point.explanation_it,
            lineIndex: analysis.grammar_point.line_index,
          }
        : null,
      // Un testo libero non ha canto: niente parlato connesso anche se Gemini ne restituisce.
      connectedSpeech: (song.kind === 'text' ? [] : analysis.connected_speech).map((c) => ({
        lineIndex: c.line_index,
        written: c.written,
        sung: c.sung,
        noteIt: c.note_it,
      })),
      lineTranslations: (analysis.line_translations ?? []).map((t) => ({ lineIndex: t.line_index, textIt: t.translation_it })),
      analyzedAt: now,
    })
    return { chunksAdded, contextsAdded, wordsPending: rows.length }
  })
}

const isAnalyzed = (song: Song) => song.status === 'analyzed' || song.status === 'studying' || song.status === 'done'

/** In coda solo se non è stata analizzata nel frattempo (un'altra analisi della stessa canzone può essere finita). */
function markQueued(db: SinglishDB, songId: string) {
  return db.songs.where('id').equals(songId).filter((s) => !isAnalyzed(s)).modify({ status: 'queued' })
}

export interface AnalyzeDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: Date
  ranks: Map<string, number>
  online: boolean
}

export async function analyzeSong(
  db: SinglishDB,
  songId: string,
  deps: AnalyzeDeps,
): Promise<'analyzed' | 'queued'> {
  const song = await db.songs.get(songId)
  if (!song) throw new Error(`Song not found: ${songId}`)
  if (isAnalyzed(song)) return 'analyzed'
  if (!deps.online) {
    await markQueued(db, songId)
    return 'queued'
  }
  const settings = await getSettings(db)
  const band: [number, number] = [settings.bandStart, settings.bandEnd]
  const known = [
    ...new Set([
      ...(await db.chunks.toArray()).map((c) => c.baseForm.toLowerCase()),
      ...(await db.words.toArray()).map((w) => w.lemma.toLowerCase()),
    ]),
  ].slice(0, 300)
  try {
    const raw = await callGemini(
      {
        apiKey: settings.apiKey,
        model: settings.model,
        system: SYSTEM_PROMPT,
        user: buildUserMessage({ level: settings.level, band, known, lines: song.lines, kind: song.kind }),
        schema: RESPONSE_SCHEMA,
      },
      { fetch: deps.fetch, sleep: deps.sleep },
    )
    const analysis = parseAnalysis(raw, song.lines.length)
    await saveAnalysis(db, songId, analysis, deps.ranks, deps.now)
    return 'analyzed'
  } catch (e) {
    // Un'altra analisi della stessa canzone (coda all'apertura, «Analizza ora») è riuscita nel frattempo: vale quella.
    const now = await db.songs.get(songId)
    if (now && isAnalyzed(now)) return 'analyzed'
    if (
      e instanceof GeminiError &&
      (e.code === 'rate_limited' ||
        e.code === 'network' ||
        (e.code === 'http' && (e.status ?? 0) >= 500))
    ) {
      await markQueued(db, songId)
      return 'queued'
    }
    throw e
  }
}

/** Canzoni aperte al massimo (spec §3). */
export const MAX_OPEN_SONGS = 4

/** Quando si è al limite di canzoni aperte: cosa succede e cosa fare. */
export const LIMIT_NOTE = `Hai già ${MAX_OPEN_SONGS} canzoni o testi aperti. Per aggiungerne un altro segnane uno come completato dallo Studio, o elimina quello che non ti serve.`

/** Le canzoni aperte: tutte quelle non completate (bozza, in coda, analizzate, in studio). Contano per il limite. */
export function activeSongs(db: SinglishDB): Promise<Song[]> {
  return db.songs.where('status').notEqual('done').toArray()
}

export async function activeSongCount(db: SinglishDB): Promise<number> {
  return (await activeSongs(db)).length
}

export async function retryQueuedSongs(
  deps: { db: SinglishDB; fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => Date },
  opts: { online?: boolean; loadRanksFn?: (f: typeof fetch) => Promise<Map<string, number>> } = {},
): Promise<void> {
  const online = opts.online ?? navigator.onLine
  if (!online) return
  const queued = await deps.db.songs.where('status').equals('queued').toArray()
  if (queued.length === 0) return
  let ranks: Map<string, number>
  try {
    ranks = await (opts.loadRanksFn ?? loadRanks)(deps.fetch)
  } catch {
    return
  }
  for (const song of queued) {
    try {
      await analyzeSong(deps.db, song.id, {
        fetch: deps.fetch,
        sleep: deps.sleep,
        now: deps.now(),
        ranks,
        online: true,
      })
    } catch {
      // resta in coda o fallisce: si riprova alla prossima apertura
    }
  }
}

/**
 * Elimina una canzone. Le voci solo sue spariscono con le loro card (e le parole da smistare); quelle condivise
 * con altre canzoni restano e perdono solo i versi di questa: se era la loro canzone d'origine, l'origine passa
 * al primo verso che resta, con la forma di quel verso. I ripassi già fatti restano come storico.
 */
export async function deleteSong(db: SinglishDB, songId: string): Promise<void> {
  await db.transaction('rw', db.songs, db.chunks, db.words, db.cards, db.reviews, async () => {
    for (const table of [db.chunks, db.words] as const) {
      const items: (Chunk | Word)[] = await (table as typeof db.chunks).toArray()
      for (const item of items.filter((i) => i.origin !== 'expand' && (i.songId === songId || i.contexts.some((x) => x.songId === songId)))) {
        const rest = item.contexts.filter((x) => x.songId !== songId)
        if (rest.length === 0) {
          const cards = await db.cards.where('itemId').equals(item.id).toArray()
          await db.cards.where('itemId').equals(item.id).delete()
          // Il profilo delle parole note (spec §7: «note o già studiate») non si perde: la parola esce dal
          // ripasso ma resta nota, così non torna in Smista con la prossima canzone.
          const studied = cards.length > 0 && (await db.reviews.where('cardId').anyOf(cards.map((c) => c.id)).count()) > 0
          if ('triage' in item && (item.triage === 'known' || item.wasKnown || (item.triage === 'learn' && studied))) {
            await db.words.update(item.id, { triage: 'known', contexts: [], suspended: false })
          } else {
            await table.delete(item.id)
          }
          continue
        }
        const patch: Partial<Chunk & Word> = { contexts: rest }
        if (item.songId === songId) {
          const [first] = rest
          const newSurface = first.surfaceForm ?? item.surfaceForm
          // Gli altri versi senza una forma propria valevano per quella vecchia: la ricevono, così restano evidenziati.
          const contexts = rest.map((x) => (x === first || x.surfaceForm || item.surfaceForm === newSurface ? x : { ...x, surfaceForm: item.surfaceForm }))
          Object.assign(patch, { contexts, songId: first.songId, lineIndex: first.lineIndex, surfaceForm: newSurface })
        }
        await (table as typeof db.chunks).update(item.id, patch)
      }
    }
    // Le voci di Espandi non hanno verso: restano finché esiste la parola da cui sono nate, e ne seguono la canzone.
    for (const table of [db.chunks, db.words] as const) {
      const items: (Chunk | Word)[] = await (table as typeof db.chunks).toArray()
      for (const item of items.filter((i) => i.origin === 'expand' && i.songId === songId)) {
        const parent = item.fromItemId ? await db.words.get(item.fromItemId) : undefined
        if (parent && parent.songId !== songId && parent.contexts.length > 0) {
          await (table as typeof db.chunks).update(item.id, { songId: parent.songId, lineIndex: parent.lineIndex })
          continue
        }
        // La parola d'origine non è più in una canzone: vale la regola del profilo, come per le altre parole.
        const cards = await db.cards.where('itemId').equals(item.id).toArray()
        await db.cards.where('itemId').equals(item.id).delete()
        const studied = cards.length > 0 && (await db.reviews.where('cardId').anyOf(cards.map((c) => c.id)).count()) > 0
        if ('triage' in item && (item.triage === 'known' || item.wasKnown || studied)) {
          await db.words.update(item.id, { triage: 'known', contexts: [], suspended: false, origin: undefined, fromItemId: undefined })
        } else {
          await table.delete(item.id)
        }
      }
    }
    await db.songs.delete(songId)
  })
}

/**
 * Escludi una voce: esce con le sue card e con le voci nate da lei con Espandi (che restano solo finché esiste).
 * Restituisce quante voci figlie sono uscite.
 */
export async function excludeItem(db: SinglishDB, itemId: string): Promise<{ children: number }> {
  return db.transaction('rw', db.chunks, db.words, db.cards, async () => {
    const children = [
      ...(await db.chunks.filter((c) => c.fromItemId === itemId).toArray()).map((c) => ({ id: c.id, table: db.chunks as typeof db.chunks | typeof db.words })),
      ...(await db.words.filter((w) => w.fromItemId === itemId).toArray()).map((w) => ({ id: w.id, table: db.words as typeof db.chunks | typeof db.words })),
    ]
    for (const ch of children) {
      await db.cards.where('itemId').equals(ch.id).delete()
      // Una parola che era nota prima di Espandi torna nel profilo: le parole che sai non tornano in Smista.
      const w = await db.words.get(ch.id)
      if (w?.wasKnown) await db.words.update(ch.id, { triage: 'known', contexts: [], suspended: false, origin: undefined, fromItemId: undefined })
      else await ch.table.delete(ch.id)
    }
    await db.cards.where('itemId').equals(itemId).delete()
    await db.chunks.delete(itemId)
    // Una parola che sapevi già torna nel profilo, come quando si esclude la sua parola d'origine.
    const self = await db.words.get(itemId)
    if (self?.wasKnown) await db.words.update(itemId, { triage: 'known', contexts: [], suspended: false, origin: undefined, fromItemId: undefined })
    else await db.words.delete(itemId)
    return { children: children.length }
  })
}

/** Quante voci sono nate da questa con Espandi. */
export async function expandChildren(db: SinglishDB, itemId: string): Promise<number> {
  return (await db.chunks.filter((c) => c.fromItemId === itemId).count()) + (await db.words.filter((w) => w.fromItemId === itemId).count())
}

/**
 * Riparazione all'apertura (dati salvati prima della regola): una voce la cui canzone non è fra i suoi versi
 * torna sul primo verso. Restituisce quante voci ha sistemato.
 */
export async function repairHomes(db: SinglishDB): Promise<number> {
  return db.transaction('rw', db.chunks, db.words, async () => {
    let fixed = 0
    for (const table of [db.chunks, db.words] as const) {
      const items: (Chunk | Word)[] = await (table as typeof db.chunks).toArray()
      for (const item of items) {
        if (item.contexts.length === 0 || isHome(item)) continue
        graduate(item)
        await (table as typeof db.chunks).put(item as Chunk)
        fixed++
      }
    }
    // Le voci di Espandi seguono la loro parola (anche quelle appena spostate).
    const words = new Map((await db.words.toArray()).map((w) => [w.id, w]))
    for (const table of [db.chunks, db.words] as const) {
      const items: (Chunk | Word)[] = await (table as typeof db.chunks).toArray()
      for (const item of items) {
        const parent = item.origin === 'expand' && item.fromItemId ? words.get(item.fromItemId) : undefined
        if (!parent || item.contexts.length > 0 || (item.songId === parent.songId && item.lineIndex === parent.lineIndex)) continue
        await (table as typeof db.chunks).update(item.id, { songId: parent.songId, lineIndex: parent.lineIndex })
        fixed++
      }
    }
    return fixed
  })
}
