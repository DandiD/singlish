import { beforeEach, describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { newFsrsCard } from '../../src/domain/scheduler'
import { dayRing, doneToday, emptyAction, featuredInvite } from '../../src/domain/today'
import type { CardRow, Chunk, Review, Song } from '../../src/db/types'

const song = (id: string, title = id): Song => ({ id, title, artist: 'Nessuno', kind: 'song', spotifyUrl: null, lines: [], status: 'analyzed' } as unknown as Song)
const A = song('a', 'Paper Boats'), B = song('b', 'Tin Roof')

describe('dayRing', () => {
  test.each([
    [{ done: 0, left: 5 }, 'todo', 5],
    [{ done: 3, left: 2 }, 'partial', 5],
    [{ done: 4, left: 0 }, 'done', 4],
    [{ done: 0, left: 0 }, 'empty', 0],
  ])('%j', (input, state, total) => {
    for (const blocked of [false, true]) {
      expect(dayRing({ ...input, blocked })).toEqual({ done: input.done, total, state, blocked })
    }
  })
})

describe('featuredInvite', () => {
  const all = { toCorrect: 2, finalDue: [A, B], toTriage: [{ song: B, count: 3 }], toStudy: [B] }
  test('priorità: frasi, riascolto, smistamento, studio, niente', () => {
    expect(featuredInvite(all)).toEqual({ kind: 'correct', count: 2 })
    expect(featuredInvite({ ...all, toCorrect: 0 })).toEqual({ kind: 'final', song: A })
    expect(featuredInvite({ ...all, toCorrect: 0, finalDue: [] })).toEqual({ kind: 'triage', song: B, count: 3 })
    expect(featuredInvite({ ...all, toCorrect: 0, finalDue: [], toTriage: [{ song: A, count: 0 }] })).toEqual({ kind: 'study', song: B })
    expect(featuredInvite({ toCorrect: 0, finalDue: [], toTriage: [{ song: A, count: 0 }], toStudy: [] })).toBeNull()
  })
})

describe('la prima canzone con parole da smistare, non la prima della lista', () => {
  const toTriage = [{ song: A, count: 0 }, { song: B, count: 3 }]
  test('featuredInvite ed emptyAction saltano la canzone senza parole', () => {
    expect(featuredInvite({ toCorrect: 0, finalDue: [], toTriage, toStudy: [] })).toEqual({ kind: 'triage', song: B, count: 3 })
    expect(emptyAction({ hasSongs: true, toCorrect: 0, toTriage, toStudy: [], toAnalyze: [] })).toEqual({ kind: 'triage', song: B, count: 3 })
  })
})

describe('emptyAction', () => {
  const full = { hasSongs: true, toCorrect: 1, toTriage: [{ song: A, count: 2 }], toStudy: [B], toAnalyze: [A] }
  test('ordine dei rami, e nessuna canzone vince su tutto', () => {
    expect(emptyAction({ ...full, hasSongs: false })).toEqual({ kind: 'add' })
    expect(emptyAction(full)).toEqual({ kind: 'correct', count: 1 })
    expect(emptyAction({ ...full, toCorrect: 0 })).toEqual({ kind: 'triage', song: A, count: 2 })
    expect(emptyAction({ ...full, toCorrect: 0, toTriage: [] })).toEqual({ kind: 'study', song: B })
    expect(emptyAction({ ...full, toCorrect: 0, toTriage: [], toStudy: [] })).toEqual({ kind: 'analyze', song: A })
    expect(emptyAction({ ...full, toCorrect: 0, toTriage: [], toStudy: [], toAnalyze: [] })).toEqual({ kind: 'none' })
  })
})

describe('doneToday', () => {
  let db: SinglishDB
  const now = new Date(2026, 10, 5, 10, 0)
  const chunk = (id: string, over: Partial<Chunk> = {}): Chunk => ({
    id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    type: 'idiom', cefr: 'B2', register: 'usable', topic: 'work', meaningIt: '', explanationIt: '', extraExampleEn: '',
    productionPromptIt: 'x', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
  })
  const card = (id: string, itemId: string): CardRow => ({ id, itemType: 'chunk', itemId, kind: 'P', unlocked: 1, due: now, fsrs: { ...newFsrsCard(now), state: State.Review }, goodRCount: 0 })
  const review = (id: string, at: Date): Review => ({ id, cardId: 'p1', rating: 3, auto: true, answer: null, elapsedMs: 1, reviewedAt: at, wasNew: false })
  beforeEach(async () => {
    db = createDb('t-' + crypto.randomUUID())
    await db.chunks.bulkAdd([chunk('c1'), chunk('c2'), chunk('c3')])
    await db.cards.bulkAdd([card('p1', 'c1'), card('p2', 'c2')])
    await db.reviews.bulkAdd([review('r1', new Date(2026, 10, 5, 0, 0)), review('r2', new Date(2026, 10, 5, 9, 0)), review('r3', new Date(2026, 10, 4, 23, 59))])
    await db.sessions.add({ id: 's', kind: 'review', songId: null, startedAt: now, endedAt: null,
      timer: { status: 'running', durationMs: 1, accumulatedMs: 0, resumedAt: 0 }, reviewsDone: 0, newDone: 0,
      productions: [
        { cardId: 'p1', itemId: 'c1', sentence: 'a', elapsedMs: 1, at: new Date(2026, 10, 5, 8, 0) },
        { cardId: 'p2', itemId: 'c2', sentence: 'b', elapsedMs: 1, at: new Date(2026, 10, 4, 22, 0) },
        { cardId: 'gone', itemId: 'c3', sentence: 'c', elapsedMs: 1, at: new Date(2026, 10, 5, 8, 30) },
      ] })
  })
  test('ripassi di oggi + frasi di oggi ancora da correggere; la frase senza card non conta', async () => {
    expect(await doneToday(db, now)).toBe(3)
  })
  test('la frase scritta oggi su un chunk sospeso non conta (è fuori dal ripasso)', async () => {
    await db.chunks.update('c1', { suspended: true })
    expect(await doneToday(db, now)).toBe(2)
  })
  test('dopo mezzanotte si riparte da zero', async () => {
    expect(await doneToday(db, new Date(2026, 10, 6, 0, 1))).toBe(0)
  })
})
