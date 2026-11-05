import { describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb } from '../../src/db/db'
import type { Chunk, Song, Word } from '../../src/db/types'
import { newCardPair, recordReview } from '../../src/domain/scheduler'
import { lineKey, rCardStates, unlockedLines } from '../../src/domain/unlocked'

const song = (lines = 3, id = 's1'): Song => ({
  id, kind: 'song', title: 'Paper Boats', artist: 'Nobody', spotifyUrl: null,
  lines: Array.from({ length: lines }, (_, i) => `invented line ${i}`),
  status: 'studying', level: 'B1', difficultyKnownPct: null, comprehensionBefore: null,
  grammarPoint: null, connectedSpeech: [], addedAt: new Date('2026-01-01'), analyzedAt: null,
})
const chunk = (id: string, lineIdxs: number[], over: Partial<Chunk> = {}, songId = 's1'): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex: lineIdxs[0] ?? 0,
  contexts: lineIdxs.map((lineIndex) => ({ songId, lineIndex })),
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: '', explanationIt: '',
  extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const word = (id: string, lineIdxs: number[], over: Partial<Word> = {}): Word => ({
  id, lemma: id, surfaceForm: id, pos: 'noun', freqRank: 1000, songId: 's1', lineIndex: lineIdxs[0] ?? 0,
  contexts: lineIdxs.map((lineIndex) => ({ songId: 's1', lineIndex })),
  cefr: 'B1', register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '',
  triage: 'learn', userEdited: false, suspended: false, ...over,
})
const st = (o: Record<string, State>) => new Map(Object.entries(o))

describe('unlockedLines', () => {
  test('lineKey', () => expect(lineKey('s1', 2)).toBe('s1:2'))

  test('all items in Review unlocks the line', () => {
    const r = unlockedLines(song(), [chunk('a', [1]), chunk('b', [1])], [], st({ a: State.Review, b: State.Review }))
    expect(r.unlocked).toBe(1)
    expect(r.total).toBe(1)
    expect(r.lines).toEqual([{ lineIndex: 1, itemIds: ['a', 'b'], unlocked: true }])
  })
  test.each([State.Learning, State.Relearning, State.New])('one item in state %s locks the line', (s) => {
    const r = unlockedLines(song(), [chunk('a', [1]), chunk('b', [1])], [], st({ a: State.Review, b: s }))
    expect(r.unlocked).toBe(0)
    expect(r.total).toBe(1)
  })
  test('item without R card locks the line', () => {
    const r = unlockedLines(song(), [chunk('a', [1])], [], new Map())
    expect(r.unlocked).toBe(0)
    expect(r.total).toBe(1)
  })
  test('suspended chunks, known and pending words do not count', () => {
    const r = unlockedLines(
      song(),
      [chunk('a', [0], { suspended: true })],
      [word('w1', [0], { triage: 'known' }), word('w2', [0], { triage: 'pending' }), word('w3', [0], { suspended: true })],
      new Map(),
    )
    expect(r).toEqual({ lines: [], unlocked: 0, total: 0 })
  })
  test('ignored items do not block a line', () => {
    const r = unlockedLines(song(), [chunk('a', [0]), chunk('b', [0], { suspended: true })], [word('w', [0], { triage: 'known' })], st({ a: State.Review }))
    expect(r.unlocked).toBe(1)
  })
  test('learn words count', () => {
    const r = unlockedLines(song(), [], [word('w', [2])], st({ w: State.Review }))
    expect(r.lines).toEqual([{ lineIndex: 2, itemIds: ['w'], unlocked: true }])
  })
  test('item on two lines appears in both, lines sorted', () => {
    const r = unlockedLines(song(), [chunk('a', [2, 0])], [], st({ a: State.Review }))
    expect(r.lines.map((l) => l.lineIndex)).toEqual([0, 2])
    expect(r.total).toBe(2)
    expect(r.unlocked).toBe(2)
  })
  test('contexts of another song are ignored', () => {
    const c = chunk('a', [0])
    c.contexts.push({ songId: 'other', lineIndex: 1 })
    const r = unlockedLines(song(), [c], [], st({ a: State.Review }))
    expect(r.lines.map((l) => l.lineIndex)).toEqual([0])
  })
  test('out of range lineIndex is ignored', () => {
    const r = unlockedLines(song(3), [chunk('a', [3, 7, -1, 1.5])], [], st({ a: State.Review }))
    expect(r.total).toBe(0)
  })
  test('two contexts on the same line count once', () => {
    const r = unlockedLines(song(), [chunk('a', [1, 1])], [], st({ a: State.Review }))
    expect(r.lines[0].itemIds).toEqual(['a'])
  })
})

describe('rCardStates + recordReview (integration)', () => {
  test('Review unlocks; Again (relearning) locks again', async () => {
    const db = createDb('t-' + crypto.randomUUID())
    const t0 = new Date('2026-01-01T10:00:00Z')
    const [r, c] = newCardPair('chunk', 'a', t0)
    await db.cards.bulkAdd([r, c])
    const inp = (rating: 1 | 3) => ({ rating, auto: false, answer: null, elapsedMs: 1 })
    const s = song()
    const ch = [chunk('a', [1])]

    let now = t0
    let card = await recordReview(db, r.id, inp(3), now, 0.9)
    for (let i = 0; i < 10 && card.fsrs.state !== State.Review; i++) {
      now = new Date(card.due.getTime() + 60_000)
      card = await recordReview(db, r.id, inp(3), now, 0.9)
    }
    expect(card.fsrs.state).toBe(State.Review)
    let states = await rCardStates(db)
    expect(states.get('a')).toBe(State.Review)
    expect(unlockedLines(s, ch, [], states).unlocked).toBe(1)

    now = new Date(card.due.getTime() + 60_000)
    await recordReview(db, r.id, inp(1), now, 0.9)
    states = await rCardStates(db)
    expect(states.get('a')).not.toBe(State.Review)
    expect(unlockedLines(s, ch, [], states).unlocked).toBe(0)
    expect(states.size).toBe(1) // only the R card, not C
  })
})
