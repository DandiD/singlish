import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { activeSongCount, analyzeSong, createSong, retryQueuedSongs, saveAnalysis } from '../../src/domain/ingest'
import { saveSettings } from '../../src/domain/settings'
import type { Analysis } from '../../src/domain/gemini/parse'
import fixtureJson from '../fixtures/analysis.json'
import tenLines from '../fixtures/lyrics.txt?raw'

const now = new Date('2026-01-01T10:00:00Z')
const analysis = fixtureJson as Analysis
const ranks = new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]])
const input = { title: 'T', artist: 'A', spotifyUrl: null, rawText: tenLines, comprehensionBefore: 55 }
const sleep = vi.fn().mockResolvedValue(undefined)
let db: SinglishDB
const deps = (over: Record<string, unknown> = {}) => ({
  fetch: vi.fn() as unknown as typeof fetch, sleep, now, ranks, online: true, ...over,
})
const okFetch = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }],
})))

beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

describe('saveAnalysis', () => {
  test('creates chunks with R unlocked and C locked; words pending', async () => {
    const song = await createSong(db, input, now)
    expect(song.status).toBe('draft')
    expect(song.lines).toHaveLength(10)
    const r = await saveAnalysis(db, song.id, analysis, ranks, now)
    expect(r).toEqual({ chunksAdded: 3, contextsAdded: 0, wordsPending: 2 })
    const cards = await db.cards.toArray()
    expect(cards).toHaveLength(6)
    expect(cards.filter(c => c.kind === 'R').every(c => c.unlocked === 1)).toBe(true)
    expect(cards.filter(c => c.kind === 'C').every(c => c.unlocked === 0)).toBe(true)
    expect(await db.words.count()).toBe(2)
    expect((await db.words.toArray()).every(w => w.triage === 'pending')).toBe(true)
    const s = (await db.songs.get(song.id))!
    expect(s.status).toBe('analyzed')
    expect(s.difficultyKnownPct).toBe(82)
    expect(s.grammarPoint?.explanationIt).toBeTruthy()
    expect(s.connectedSpeech).toHaveLength(2)
    expect(s.analyzedAt).toEqual(now)
  })

  test('same chunk in a second song adds a context, not cards', async () => {
    const s1 = await createSong(db, input, now)
    const s2 = await createSong(db, input, now)
    await saveAnalysis(db, s1.id, analysis, ranks, now)
    const r2 = await saveAnalysis(db, s2.id, analysis, ranks, now)
    expect(r2.chunksAdded).toBe(0)
    expect(r2.contextsAdded).toBe(3)
    expect(await db.cards.count()).toBe(6)
    const c = await db.chunks.toArray()
    expect(c[0].contexts).toHaveLength(2)
    const w = await db.words.toArray()
    expect(w.every(x => x.contexts.length === 2)).toBe(true)
    await saveAnalysis(db, s2.id, analysis, ranks, now)
    expect((await db.chunks.toArray())[0].contexts).toHaveLength(2)
  })

  test('same lemma on two lines in one analysis saves one word with two contexts', async () => {
    const s1 = await createSong(db, input, now)
    const w = analysis.words[1]
    const dup = { ...analysis, words: [{ ...w, lemma: ' Wander', line_index: 2 }, { ...w, line_index: 7 }] }
    const r = await saveAnalysis(db, s1.id, dup, ranks, now)
    expect(r).toMatchObject({ chunksAdded: 3, wordsPending: 1 })
    const words = await db.words.toArray()
    expect(words).toHaveLength(1)
    expect(words[0].lemma).toBe('wander')
    expect(words[0].contexts).toEqual([{ songId: s1.id, lineIndex: 2 }, { songId: s1.id, lineIndex: 7 }])
    expect(await db.chunks.count()).toBe(3)
  })

  test('un contesto salvato senza forma prende la forma quando la canzone viene salvata di nuovo', async () => {
    const s1 = await createSong(db, input, now)
    const s2 = await createSong(db, input, now)
    const c = analysis.chunks[0]
    await saveAnalysis(db, s1.id, { ...analysis, chunks: [c], words: [] }, ranks, now)
    const [old] = await db.chunks.toArray()
    await db.chunks.update(old.id, { contexts: [...old.contexts, { songId: s2.id, lineIndex: 4 }] }) // dato vecchio
    await saveAnalysis(db, s2.id, { ...analysis, chunks: [{ ...c, surface_form: 'ran out of', line_index: 4 }], words: [] }, ranks, now)
    const [chunk] = await db.chunks.toArray()
    expect(chunk.contexts).toEqual([
      { songId: s1.id, lineIndex: c.line_index },
      { songId: s2.id, lineIndex: 4, surfaceForm: 'ran out of' },
    ])
  })

  test('un verso dove la voce compare in un\'altra forma ricorda quella forma', async () => {
    const s1 = await createSong(db, input, now)
    const s2 = await createSong(db, input, now)
    const c = analysis.chunks[0]
    const w = analysis.words[1]
    await saveAnalysis(db, s1.id, { ...analysis, chunks: [c], words: [w] }, ranks, now)
    await saveAnalysis(db, s2.id, {
      ...analysis,
      chunks: [{ ...c, surface_form: c.surface_form + 'ing', line_index: 4 }],
      words: [{ ...w, surface_form: 'wandered', line_index: 5 }, { ...w, line_index: 6 }],
    }, ranks, now)
    const [chunk] = await db.chunks.toArray()
    expect(chunk.contexts).toEqual([
      { songId: s1.id, lineIndex: c.line_index },
      { songId: s2.id, lineIndex: 4, surfaceForm: c.surface_form + 'ing' },
    ])
    const [word] = await db.words.toArray()
    expect(word.contexts.slice(1)).toEqual([
      { songId: s2.id, lineIndex: 5, surfaceForm: 'wandered' },
      { songId: s2.id, lineIndex: 6 },
    ])
  })

  test('nella stessa analisi, una parola ripetuta in un\'altra forma ricorda la forma di ogni verso', async () => {
    const s1 = await createSong(db, input, now)
    const w = analysis.words[1]
    await saveAnalysis(db, s1.id, { ...analysis, words: [{ ...w, line_index: 2 }, { ...w, surface_form: 'wandered', line_index: 7 }] }, ranks, now)
    const [word] = await db.words.toArray()
    expect(word.contexts).toEqual([{ songId: s1.id, lineIndex: 2 }, { songId: s1.id, lineIndex: 7, surfaceForm: 'wandered' }])
  })

  test('key differing by case/apostrophes reuses the chunk', async () => {
    const s1 = await createSong(db, input, now)
    const s2 = await createSong(db, input, now)
    const base = { ...analysis, chunks: [{ ...analysis.chunks[0], base_form: "Don't give up" }], words: [] }
    await saveAnalysis(db, s1.id, base, ranks, now)
    const variant = { ...base, chunks: [{ ...base.chunks[0], base_form: 'DON’T Give Up' }] }
    const r = await saveAnalysis(db, s2.id, variant, ranks, now)
    expect(r).toMatchObject({ chunksAdded: 0, contextsAdded: 1 })
    expect(await db.chunks.count()).toBe(1)
    expect(await db.cards.count()).toBe(2)
  })
})

test('saveAnalysis salva sulla canzone le traduzioni dei versi', async () => {
  const song = await createSong(db, input, now)
  const withT: Analysis = { ...analysis, line_translations: [{ line_index: 3, translation_it: 'Ho capito che non saresti mai venuto' }] }
  await saveAnalysis(db, song.id, withT, ranks, now)
  expect((await db.songs.get(song.id))!.lineTranslations).toEqual([{ lineIndex: 3, textIt: 'Ho capito che non saresti mai venuto' }])
})

describe('analyzeSong', () => {
  test('success analyzes the song', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const song = await createSong(db, input, now)
    expect(await analyzeSong(db, song.id, deps({ fetch: okFetch() }))).toBe('analyzed')
    expect((await db.songs.get(song.id))!.status).toBe('analyzed')
    expect(await db.chunks.count()).toBe(3)
    expect(await activeSongCount(db)).toBe(1)
  })
  test('un\'altra analisi riuscita nel frattempo vince sull\'errore di questa: si dice «analizzata», non «in coda»', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const song = await createSong(db, input, now)
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const slow429 = vi.fn(async () => { await gate; return new Response('{}', { status: 429 }) }) as unknown as typeof fetch
    const failing = analyzeSong(db, song.id, deps({ fetch: slow429 }))
    expect(await analyzeSong(db, song.id, deps({ fetch: okFetch() }))).toBe('analyzed')
    release()
    expect(await failing).toBe('analyzed')
    expect((await db.songs.get(song.id))!.status).toBe('analyzed')
  })
  test('offline queues without calling', async () => {
    const song = await createSong(db, input, now)
    const f = vi.fn()
    expect(await analyzeSong(db, song.id, deps({ fetch: f, online: false }))).toBe('queued')
    expect(f).not.toHaveBeenCalled()
    expect((await db.songs.get(song.id))!.status).toBe('queued')
    expect(await activeSongCount(db)).toBe(1)
  })
  test('activeSongCount counts everything but done', async () => {
    for (const status of ['draft', 'queued', 'analyzed', 'studying', 'done'] as const) {
      const s = await createSong(db, input, now)
      await db.songs.update(s.id, { status })
    }
    expect(await activeSongCount(db)).toBe(4)
  })
  test('rate limited ends queued', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const song = await createSong(db, input, now)
    const f = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 429 })))
    expect(await analyzeSong(db, song.id, deps({ fetch: f }))).toBe('queued')
    expect((await db.songs.get(song.id))!.status).toBe('queued')
  })
  test('no_key rethrows and leaves status', async () => {
    const song = await createSong(db, input, now)
    await expect(analyzeSong(db, song.id, deps())).rejects.toMatchObject({ code: 'no_key' })
    expect((await db.songs.get(song.id))!.status).toBe('draft')
  })
  test('http 400 rethrows', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const song = await createSong(db, input, now)
    const f = vi.fn().mockResolvedValue(new Response('', { status: 400 }))
    await expect(analyzeSong(db, song.id, deps({ fetch: f }))).rejects.toMatchObject({ code: 'http', status: 400 })
    expect((await db.songs.get(song.id))!.status).toBe('draft')
  })
  test('missing song throws', async () => {
    await expect(analyzeSong(db, 'nope', deps())).rejects.toThrow()
  })
})

describe('analisi lanciata due volte sulla stessa canzone', () => {
  test('la seconda analisi non tocca una canzone già analizzata (né stato né dati)', async () => {
    const song = await createSong(db, input, now)
    await saveAnalysis(db, song.id, analysis, ranks, now)
    await db.songs.update(song.id, { status: 'studying' })
    const before = { chunks: await db.chunks.count(), cards: await db.cards.count(), words: await db.words.count() }
    const other = { ...analysis, chunks: [{ ...analysis.chunks[0], base_form: 'something else' }], grammar_point: null }
    await saveAnalysis(db, song.id, other, ranks, now)
    const s = (await db.songs.get(song.id))!
    expect(s.status).toBe('studying')
    expect(s.grammarPoint).not.toBeNull()
    expect({ chunks: await db.chunks.count(), cards: await db.cards.count(), words: await db.words.count() }).toEqual(before)
  })
  test('un 429 arrivato dopo non rimette in coda una canzone già analizzata', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const song = await createSong(db, input, now)
    await saveAnalysis(db, song.id, analysis, ranks, now)
    await db.songs.update(song.id, { status: 'studying' })
    const busy = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }))
    await analyzeSong(db, song.id, deps({ fetch: busy }))
    expect((await db.songs.get(song.id))!.status).toBe('studying')
  })
  test('offline non rimette in coda una canzone già analizzata', async () => {
    const song = await createSong(db, input, now)
    await saveAnalysis(db, song.id, analysis, ranks, now)
    await analyzeSong(db, song.id, deps({ online: false }))
    expect((await db.songs.get(song.id))!.status).toBe('analyzed')
  })
})

describe('retryQueuedSongs', () => {
  test('re-analyzes queued songs sequentially and ignores per-song errors', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const a = await createSong(db, input, now)
    const b = await createSong(db, input, now)
    await db.songs.update(a.id, { status: 'queued' })
    await db.songs.update(b.id, { status: 'queued' })
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }],
      })))
    const freq = vi.fn().mockResolvedValue(ranks)
    await retryQueuedSongs(
      { db, fetch: fetchFn as unknown as typeof fetch, sleep, now: () => now },
      { online: true, loadRanksFn: freq },
    )
    const statuses = (await db.songs.toArray()).map((s) => s.status).sort()
    expect(statuses).toEqual(['analyzed', 'queued'])
  })

  test('does nothing when offline', async () => {
    const a = await createSong(db, input, now)
    await db.songs.update(a.id, { status: 'queued' })
    const fetchFn = vi.fn()
    await retryQueuedSongs(
      { db, fetch: fetchFn as unknown as typeof fetch, sleep, now: () => now },
      { online: false },
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
