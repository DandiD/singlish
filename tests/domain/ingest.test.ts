import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { activeSongCount, analyzeSong, createSong, openSongCount, retryQueuedSongs, saveAnalysis } from '../../src/domain/ingest'
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
    expect(await openSongCount(db)).toBe(1)
  })
  test('offline queues without calling', async () => {
    const song = await createSong(db, input, now)
    const f = vi.fn()
    expect(await analyzeSong(db, song.id, deps({ fetch: f, online: false }))).toBe('queued')
    expect(f).not.toHaveBeenCalled()
    expect((await db.songs.get(song.id))!.status).toBe('queued')
    expect(await openSongCount(db)).toBe(0)
    expect(await activeSongCount(db)).toBe(1)
  })
  test('activeSongCount counts everything but done', async () => {
    for (const status of ['draft', 'queued', 'analyzed', 'studying', 'done'] as const) {
      const s = await createSong(db, input, now)
      await db.songs.update(s.id, { status })
    }
    expect(await activeSongCount(db)).toBe(4)
    expect(await openSongCount(db)).toBe(2)
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
