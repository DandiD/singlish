import { beforeEach, describe, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import type { Word } from '../../src/db/types'
import { applyTriage, pendingWords } from '../../src/domain/triage'

const now = new Date('2026-01-01T10:00:00Z')
const mk = (id: string, lemma: string, songId: string, lineIndex: number): Word => ({
  id, lemma, surfaceForm: lemma, pos: 'noun', freqRank: 5000, songId, lineIndex,
  contexts: [{ songId, lineIndex }], cefr: 'B2', register: 'usable', topic: 't',
  meaningIt: 'm', explanationIt: 'e', extraExampleEn: 'x', triage: 'pending',
  userEdited: false, suspended: false,
})
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await db.words.bulkAdd([mk('w1', 'a', 's1', 5), mk('w2', 'b', 's1', 2), mk('w3', 'c', 's2', 0)])
})

describe('triage', () => {
  test('pendingWords filters by song and sorts by lineIndex', async () => {
    expect((await pendingWords(db, 's1')).map((w) => w.id)).toEqual(['w2', 'w1'])
  })
  test('learn creates R and C, known creates nothing', async () => {
    const r = await applyTriage(db, { w1: 'learn', w2: 'known' }, now)
    expect(r).toEqual({ known: 1, learn: 1 })
    expect(await db.cards.where('itemId').equals('w1').count()).toBe(2)
    expect(await db.cards.where('itemId').equals('w2').count()).toBe(0)
    const cards = await db.cards.where('itemId').equals('w1').toArray()
    expect(cards.map((c) => [c.kind, c.unlocked, c.itemType]).sort()).toEqual([['C', 0, 'word'], ['R', 1, 'word']])
    expect((await db.words.get('w1'))!.triage).toBe('learn')
    expect((await db.words.get('w2'))!.triage).toBe('known')
    expect((await pendingWords(db, 's1')).length).toBe(0)
  })
  test('idempotent; unknown ids ignored', async () => {
    await applyTriage(db, { w1: 'learn' }, now)
    const r = await applyTriage(db, { w1: 'learn', nope: 'known' }, now)
    expect(r).toEqual({ known: 0, learn: 0 })
    expect(await db.cards.where('itemId').equals('w1').count()).toBe(2)
  })
})
