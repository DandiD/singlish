import { describe, expect, test } from 'vitest'
import { createDb } from '../../src/db/db'
import type { Chunk, Song, Word } from '../../src/db/types'
import { newCardPair, recordReview } from '../../src/domain/scheduler'
import { newlyUnlocked, strongestSince, unlockedKeys } from '../../src/domain/unlocked'

const song = (id: string, over: Partial<Song> = {}): Song => ({
  id, kind: 'song', title: id, artist: 'Nobody', spotifyUrl: null,
  lines: ['invented line 0', 'invented line 1', 'invented line 2'],
  status: 'studying', level: 'B1', difficultyKnownPct: null, comprehensionBefore: null,
  grammarPoint: null, connectedSpeech: [], addedAt: new Date('2026-01-01'), analyzedAt: null, ...over,
})
const chunk = (id: string, songId: string, lineIndex: number, over: Partial<Chunk> = {}): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex,
  contexts: [{ songId, lineIndex }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'sig ' + id, explanationIt: '',
  extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const inp = (rating: 1 | 3 | 4) => ({ rating, auto: false, answer: null, elapsedMs: 1 })
const T0 = new Date('2026-01-01T10:00:00Z')

/** Porta la card R di una voce in Review. */
async function toReview(db: ReturnType<typeof createDb>, itemId: string, itemType: 'chunk' | 'word' = 'chunk') {
  const [r, c] = newCardPair(itemType, itemId, T0)
  await db.cards.bulkAdd([r, c])
  let now = T0
  let card = await recordReview(db, r.id, inp(3), now, 0.9)
  for (let i = 0; i < 10 && card.fsrs.state !== 2; i++) {
    now = new Date(card.due.getTime() + 60_000)
    card = await recordReview(db, r.id, inp(3), now, 0.9)
  }
  return { cardId: r.id, card, now }
}
const fresh = () => createDb('t-' + crypto.randomUUID())

describe('recordReview stability', () => {
  test('saves before and after; grows on Good from Review', async () => {
    const db = fresh()
    const { cardId, card, now } = await toReview(db, 'a')
    const t = new Date(card.due.getTime() + 1000)
    await recordReview(db, cardId, inp(3), t, 0.9)
    const rev = (await db.reviews.where('cardId').equals(cardId).toArray()).find((r) => r.reviewedAt.getTime() === t.getTime())!
    expect(rev.stability!.before).toBe(card.fsrs.stability)
    expect(rev.stability!.after).toBeGreaterThan(rev.stability!.before)
    expect(now).toBeDefined()
  })
})

describe('unlockedKeys / newlyUnlocked', () => {
  async function setup() {
    const db = fresh()
    await db.songs.bulkAdd([
      song('s1'), song('s2', { addedAt: new Date('2025-06-01'), lineTranslations: [{ lineIndex: 0, textIt: 'riga zero' }], connectedSpeech: [{ lineIndex: 0, written: 'gonna', spoken: 'going to' } as never] }),
      song('s3', { status: 'analyzed' }), song('s4', { status: 'draft' }), song('s5', { status: 'done' }),
    ])
    await db.chunks.bulkAdd([
      chunk('a', 's1', 1, { surfaceForm: 'line 1' }), chunk('b', 's2', 0), chunk('c', 's3', 0), chunk('d', 's4', 0), chunk('e', 's5', 2),
    ])
    for (const id of ['a', 'b', 'c', 'd', 'e']) await toReview(db, id)
    return db
  }
  test('studying and done count; analyzed and draft do not', async () => {
    const db = await setup()
    expect((await unlockedKeys(db)).sort()).toEqual(['s1:1', 's2:0', 's5:2'])
  })
  test('only verses not in before; ordered by addedAt then line; spans without cs:', async () => {
    const db = await setup()
    const r = await newlyUnlocked(db, ['s1:1'])
    expect(r.map((v) => `${v.song.id}:${v.lineIndex}`)).toEqual(['s2:0', 's5:2'])
    expect(r[0].line).toBe('invented line 0')
    expect(r[0].translation).toBe('riga zero')
    expect(r[1].translation).toBeNull()
    expect(r[0].spans.every((s) => !s.id.startsWith('cs:'))).toBe(true)
  })
  test('with a single new verse, returns line and spans', async () => {
    const db = await setup()
    const r = await newlyUnlocked(db, ['s2:0', 's5:2'])
    expect(r).toHaveLength(1)
    expect(r[0].line).toBe('invented line 1')
    expect(r[0].spans.map((s) => s.id)).toEqual(['a'])
  })
  test('empty when nothing is unlocked', async () => {
    const db = fresh()
    await db.songs.add(song('s1'))
    expect(await newlyUnlocked(db, [])).toEqual([])
  })
})

describe('strongestSince', () => {
  test('ranks by growth, skips Again-only, old and legacy reviews; respects limit', async () => {
    const db = fresh()
    await db.songs.add(song('s1'))
    const names = ['big', 'mid', 'small', 'again', 'old', 'legacy']
    await db.chunks.bulkAdd(names.map((n, i) => chunk(n, 's1', i % 3)))
    const base = new Date('2026-02-01T10:00:00Z')
    const cards: Record<string, string> = {}
    for (const n of names) {
      const [r, c] = newCardPair('chunk', n, T0)
      await db.cards.bulkAdd([r, c])
      cards[n] = r.id
    }
    const rev = (n: string, rating: 1 | 3 | 4, at: Date, stability?: { before: number; after: number }) =>
      db.reviews.add({ id: crypto.randomUUID(), cardId: cards[n], rating, auto: false, answer: null, elapsedMs: 1, reviewedAt: at, wasNew: false, stability })
    const at = new Date(base.getTime() + 1000)
    await rev('big', 3, at, { before: 1, after: 11 })
    await rev('mid', 3, at, { before: 1, after: 6 })
    await rev('small', 4, at, { before: 1, after: 2 })
    await rev('again', 1, at, { before: 5, after: 9 })
    await rev('old', 3, new Date('2026-01-15'), { before: 1, after: 50 })
    await rev('legacy', 3, at)
    const all = await strongestSince(db, base)
    expect(all.map((s) => s.text)).toEqual(['big', 'mid', 'small'])
    expect(all[0]).toMatchObject({ itemId: 'big', meaningIt: 'sig big', growth: 10 })
    expect(all[0].song?.id).toBe('s1')
    expect((await strongestSince(db, base, 2)).map((s) => s.text)).toEqual(['big', 'mid'])
  })
  test('no growth gives an empty list', async () => {
    const db = fresh()
    expect(await strongestSince(db, T0)).toEqual([])
  })
  test('reviews of deleted cards or items are skipped; words are supported', async () => {
    const db = fresh()
    const w: Word = {
      id: 'w1', lemma: 'ember', surfaceForm: 'embers', pos: 'noun', freqRank: 1, songId: 'gone', lineIndex: 0,
      contexts: [{ songId: 'gone', lineIndex: 0 }], cefr: 'B1', register: 'usable', topic: '', meaningIt: 'brace',
      explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false,
    }
    await db.words.add(w)
    const [rw] = newCardPair('word', 'w1', T0)
    const [rx] = newCardPair('chunk', 'nope', T0)
    await db.cards.bulkAdd([rw, rx])
    const at = new Date('2026-02-01')
    const mk = (cardId: string) => db.reviews.add({ id: crypto.randomUUID(), cardId, rating: 3, auto: false, answer: null, elapsedMs: 1, reviewedAt: at, wasNew: false, stability: { before: 0, after: 3 } })
    await mk(rw.id); await mk(rx.id); await mk('missing-card')
    const r = await strongestSince(db, T0)
    expect(r).toEqual([{ itemId: 'w1', text: 'ember', meaningIt: 'brace', song: null, growth: 3 }])
  })
})
