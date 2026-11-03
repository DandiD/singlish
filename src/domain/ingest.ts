import type { SinglishDB } from '../db/db'
import type { Chunk, Context, Song, Word } from '../db/types'
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
}

export async function createSong(db: SinglishDB, input: SongInput, now: Date): Promise<Song> {
  const settings = await getSettings(db)
  const song: Song = {
    id: newId(),
    kind: 'song',
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
const contextOf = (songId: string, lineIndex: number, surface: string, itemSurface: string): Context =>
  surface && surface !== itemSurface ? { songId, lineIndex, surfaceForm: surface } : { songId, lineIndex }

const addContext = (contexts: Context[], ctx: Context): boolean => {
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
    let chunksAdded = 0
    let contextsAdded = 0

    for (const c of analysis.chunks) {
      const key = normalizeKey(c.base_form)
      const existing = await db.chunks.where('key').equals(key).first()
      if (existing) {
        if (addContext(existing.contexts, contextOf(songId, c.line_index, c.surface_form, existing.surfaceForm))) {
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
        pronunciationNoteIt: c.pronunciation_note_it ?? '',
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
      connectedSpeech: analysis.connected_speech.map((c) => ({
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
  if (!deps.online) {
    await db.songs.update(songId, { status: 'queued' })
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
        user: buildUserMessage({ level: settings.level, band, known, lines: song.lines }),
        schema: RESPONSE_SCHEMA,
      },
      { fetch: deps.fetch, sleep: deps.sleep },
    )
    const analysis = parseAnalysis(raw, song.lines.length)
    await saveAnalysis(db, songId, analysis, deps.ranks, deps.now)
    return 'analyzed'
  } catch (e) {
    if (
      e instanceof GeminiError &&
      (e.code === 'rate_limited' ||
        e.code === 'network' ||
        (e.code === 'http' && (e.status ?? 0) >= 500))
    ) {
      await db.songs.update(songId, { status: 'queued' })
      return 'queued'
    }
    throw e
  }
}

/** Canzoni aperte al massimo (spec §3). */
export const MAX_OPEN_SONGS = 4

/** Quando si è al limite di canzoni aperte: cosa succede e cosa fare. */
export const LIMIT_NOTE = `Hai già ${MAX_OPEN_SONGS} canzoni aperte. Segnane una come completata per aggiungerne un'altra.`

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
