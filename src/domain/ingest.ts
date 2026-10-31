import type { SinglishDB } from '../db/db'
import type { CardRow, Chunk, Context, Song, Word } from '../db/types'
import { filterWordsByBand } from './freq'
import { GeminiError, callGemini } from './gemini/client'
import { parseAnalysis, type Analysis } from './gemini/parse'
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, buildUserMessage } from './gemini/prompt'
import { newFsrsCard } from './scheduler'
import { getSettings } from './settings'
import { normalizeKey, splitLines } from './text'

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
    id: crypto.randomUUID(),
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

const addContext = (contexts: Context[], ctx: Context): boolean => {
  if (contexts.some((c) => c.songId === ctx.songId && c.lineIndex === ctx.lineIndex)) return false
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
      const ctx = { songId, lineIndex: c.line_index }
      const existing = await db.chunks.where('key').equals(key).first()
      if (existing) {
        if (addContext(existing.contexts, ctx)) {
          await db.chunks.put(existing)
          contextsAdded++
        }
        continue
      }
      const chunk: Chunk = {
        id: crypto.randomUUID(),
        songId,
        key,
        baseForm: c.base_form,
        surfaceForm: c.surface_form,
        lineIndex: c.line_index,
        contexts: [ctx],
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
      const card = (kind: 'R' | 'C'): CardRow => ({
        id: crypto.randomUUID(),
        itemType: 'chunk',
        itemId: chunk.id,
        kind,
        unlocked: kind === 'R' ? 1 : 0,
        due: now,
        fsrs: newFsrsCard(now),
        goodRCount: 0,
      })
      await db.cards.bulkAdd([card('R'), card('C')])
      chunksAdded++
    }

    const known = new Set((await db.words.toArray()).map((w) => w.lemma.toLowerCase()))
    const fresh = []
    for (const w of analysis.words) {
      const lemma = w.lemma.trim().toLowerCase()
      if (known.has(lemma)) {
        const existing = await db.words.where('lemma').equals(lemma).first()
        if (existing && addContext(existing.contexts, { songId, lineIndex: w.line_index })) {
          await db.words.put(existing)
        }
      } else {
        fresh.push(w)
      }
    }
    const accepted = filterWordsByBand(fresh, ranks, band, known)
    const rows: Word[] = accepted.map((w) => ({
      id: crypto.randomUUID(),
      lemma: w.lemma.trim().toLowerCase(),
      surfaceForm: w.surface_form,
      pos: w.pos,
      freqRank: w.freqRank,
      songId,
      lineIndex: w.line_index,
      contexts: [{ songId, lineIndex: w.line_index }],
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
    ...(await db.chunks.toArray()).map((c) => c.baseForm.toLowerCase()),
    ...(await db.words.toArray()).map((w) => w.lemma.toLowerCase()),
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

export async function openSongCount(db: SinglishDB): Promise<number> {
  return db.songs.where('status').anyOf('analyzed', 'studying').count()
}
