import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { excludeItem, repairHomes } from '../../src/domain/ingest'
import { newCardPair } from '../../src/domain/scheduler'
import type { Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('escludere la parola madre rimette nel profilo le parole che erano note', async () => {
  await db.words.bulkAdd([word('exhausted'), word('tired', { contexts: [], origin: 'expand', fromItemId: 'exhausted', wasKnown: true }), word('exhaustion', { contexts: [], origin: 'expand', fromItemId: 'exhausted' })])
  for (const id of ['exhausted', 'tired', 'exhaustion']) await db.cards.bulkAdd(newCardPair('word', id, now))
  expect(await excludeItem(db, 'exhausted')).toEqual({ children: 2 })
  expect((await db.words.toArray()).map((w) => [w.lemma, w.triage])).toEqual([['tired', 'known']])
  expect(await db.cards.count()).toBe(0)
})

test('all\'apertura, le voci con una canzone che non è fra i loro versi tornano sul primo verso', async () => {
  await db.words.bulkAdd([word('wander', { songId: 'gone', lineIndex: 9, contexts: [{ songId: 'B', lineIndex: 2 }], triage: 'known' }), word('ok')])
  expect(await repairHomes(db)).toBe(1)
  expect(await db.words.get('wander')).toMatchObject({ songId: 'B', lineIndex: 2 })
  expect(await db.words.get('ok')).toMatchObject({ songId: 'A', lineIndex: 0 })
})
