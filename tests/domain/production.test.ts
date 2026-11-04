import { beforeEach, describe, expect, test, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { recordReview, newFsrsCard } from '../../src/domain/scheduler'
import { saveProduction, pendingProductions, correctProductions, confirmProductions, CORRECT_SCHEMA } from '../../src/domain/production'
import { saveSettings } from '../../src/domain/settings'
import type { CardRow, Chunk } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const chunk = (over: Partial<Chunk> = {}): Chunk => ({
  id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: 'work', meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '',
  productionPromptIt: 'Dici a un collega che non darai peso a un commento antipatico.', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const cCard = (state: State): CardRow => ({ id: 'k1', itemType: 'chunk', itemId: 'c1', kind: 'C', unlocked: 1, due: now,
  fsrs: { ...newFsrsCard(now), state, stability: 3, difficulty: 5, reps: 3, last_review: new Date(now.getTime() - 3 * 86400000), due: now }, goodRCount: 2 })
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await db.chunks.add(chunk()) })

describe('sblocco della card Produci', () => {
  test('quando la card Completa di un chunk va in ripasso, nasce la card Produci', async () => {
    await db.cards.add(cCard(State.Review))
    await recordReview(db, 'k1', { rating: 3, auto: true, answer: 'let it slide', elapsedMs: 5000 }, now, 0.9)
    const p = await db.cards.where('itemId').equals('c1').filter((c) => c.kind === 'P').toArray()
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ unlocked: 1, itemType: 'chunk' })
    await recordReview(db, 'k1', { rating: 3, auto: true, answer: 'let it slide', elapsedMs: 5000 }, new Date(now.getTime() + 9e8), 0.9)
    expect(await db.cards.where('itemId').equals('c1').filter((c) => c.kind === 'P').count()).toBe(1)
  })
  test('niente card Produci per un chunk senza situazione o se la Completa è sbagliata', async () => {
    await db.chunks.update('c1', { productionPromptIt: '' })
    await db.cards.add(cCard(State.Review))
    await recordReview(db, 'k1', { rating: 3, auto: true, answer: 'x', elapsedMs: 5000 }, now, 0.9)
    expect(await db.cards.where('itemId').equals('c1').filter((c) => c.kind === 'P').count()).toBe(0)
  })
})

describe('frasi da correggere', () => {
  beforeEach(async () => {
    await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: null,
      timer: { status: 'running', durationMs: 1800000, accumulatedMs: 0, resumedAt: 0 }, reviewsDone: 0, newDone: 0 })
    await db.cards.add({ ...cCard(State.Review), id: 'p1', kind: 'P' })
  })
  test('una frase scritta si salva nella sessione e resta da correggere', async () => {
    await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'He was rude but I let it slide.', elapsedMs: 9000 })
    expect(await pendingProductions(db)).toEqual([{ sessionId: 'r1', cardId: 'p1', itemId: 'c1', sentence: 'He was rude but I let it slide.', elapsedMs: 9000 }])
  })
  test('una sola chiamata corregge tutte le frasi; confermare i voti registra i ripassi e svuota l\'elenco', async () => {
    await saveSettings(db, { apiKey: 'k' })
    await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'He was rude but I let it slide.', elapsedMs: 9000 })
    const answer = { results: [{ id: 'p1', verdict: 'correct', corrected: 'He was rude but I let it slide.', note_it: 'Naturale.', rating: 3 }] }
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
    const fb = await correctProductions(db, { fetch: f as unknown as typeof fetch, sleep: async () => {} })
    expect(f).toHaveBeenCalledTimes(1)
    expect(fb).toEqual([expect.objectContaining({ cardId: 'p1', verdict: 'correct', noteIt: 'Naturale.', rating: 3, chunk: 'let it slide' })])
    await confirmProductions(db, [{ ...fb[0], rating: 4 }], now, 0.9)
    const reviews = await db.reviews.toArray()
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ cardId: 'p1', rating: 4, answer: 'He was rude but I let it slide.', auto: false })
    expect(await pendingProductions(db)).toEqual([])
    expect(CORRECT_SCHEMA.required).toEqual(['results'])
  })
})
