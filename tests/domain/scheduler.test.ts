import { beforeEach, describe, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { newCardPair, recordReview } from '../../src/domain/scheduler'

const now = new Date('2026-01-01T10:00:00Z')
const later = (n: number) => new Date(now.getTime() + n * 86400000)
const inp = (rating: 1 | 2 | 3 | 4) => ({ rating, auto: false, answer: null, elapsedMs: 1 })
let db: SinglishDB
let rId: string
let cId: string
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  const [r, c] = newCardPair('chunk', 'i1', now)
  rId = r.id
  cId = c.id
  await db.cards.bulkAdd([r, c])
})

describe('scheduler', () => {
  test('good moves due forward and logs a review', async () => {
    const c = await recordReview(db, rId, { rating: 3, auto: false, answer: null, elapsedMs: 4000 }, now, 0.9)
    expect(c.due.getTime()).toBeGreaterThan(now.getTime())
    expect((await db.cards.get(rId))!.due.getTime()).toBe(c.due.getTime())
    const rev = await db.reviews.where('cardId').equals(rId).toArray()
    expect(rev).toHaveLength(1)
    expect(rev[0].wasNew).toBe(true)
    expect(rev[0].reviewedAt).toEqual(now)
  })
  test('C unlocks after two non-Again R reviews', async () => {
    await recordReview(db, rId, inp(1), now, 0.9)
    await recordReview(db, rId, inp(3), later(1), 0.9)
    expect((await db.cards.get(cId))!.unlocked).toBe(0)
    await recordReview(db, rId, inp(2), later(2), 0.9)
    const c = (await db.cards.get(cId))!
    expect(c.unlocked).toBe(1)
    expect(c.due).toEqual(later(2))
    expect((await db.cards.get(rId))!.goodRCount).toBe(2)
  })
  test('again keeps card due soon', async () => {
    const c = await recordReview(db, rId, inp(1), now, 0.9)
    expect(c.due.getTime() - now.getTime()).toBeLessThan(15 * 60 * 1000)
  })
  test('reviewing C changes neither goodRCount nor unlock state', async () => {
    await db.cards.update(cId, { unlocked: 1 })
    await recordReview(db, cId, inp(3), now, 0.9)
    expect((await db.cards.get(cId))!.goodRCount).toBe(0)
    expect((await db.cards.get(rId))!.goodRCount).toBe(0)
    expect((await db.cards.get(rId))!.unlocked).toBe(1)
  })
  test('already unlocked C is not touched again', async () => {
    await recordReview(db, rId, inp(3), now, 0.9)
    await recordReview(db, rId, inp(3), later(1), 0.9)
    await db.cards.update(cId, { due: later(30) })
    await recordReview(db, rId, inp(3), later(5), 0.9)
    expect((await db.cards.get(cId))!.due).toEqual(later(30))
  })
  test('throws for unknown card', async () => {
    await expect(recordReview(db, 'nope', inp(3), now, 0.9)).rejects.toThrow()
  })
})
