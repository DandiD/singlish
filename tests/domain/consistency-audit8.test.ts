import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { deleteSong } from '../../src/domain/ingest'
import { addExpansion } from '../../src/domain/expand'
import { buildSessionQueue } from '../../src/domain/queue'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair } from '../../src/domain/scheduler'
import type { Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song = (id: string): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now })
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'adjective', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: 'x', triage: 'learn', userEdited: false, suspended: false, ...over })
const reviewed = async (db: SinglishDB, itemId: string) => {
  await db.cards.bulkAdd(newCardPair('word', itemId, now))
  const r = (await db.cards.where('itemId').equals(itemId).first())!
  await db.reviews.add({ id: 'r-' + itemId, cardId: r.id, rating: 3, auto: false, answer: null, elapsedMs: 1, reviewedAt: now, wasNew: true })
}
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { apiKey: 'k' }) })

test('una parola del profilo scelta in Espandi entra davvero nel ripasso, come voce della parola espansa', async () => {
  await db.songs.add(song('B'))
  await db.words.add(word('reluctance', { triage: 'known', songId: 'gone', contexts: [] }))
  await db.words.add(word('reluctant', { songId: 'B', contexts: [{ songId: 'B', lineIndex: 0 }],
    expansion: { family: [{ lemma: 'reluctance', pos: 'noun', meaning_it: 'riluttanza', example_en: 'x' }], collocations: [], opposites: [], nuance: null } }))
  await db.cards.bulkAdd(newCardPair('word', 'reluctant', now))
  await addExpansion(db, 'reluctant', { family: ['reluctance'], collocations: [], opposites: [], nuance: false }, now)
  expect(await db.words.get('reluctance')).toMatchObject({ triage: 'learn', songId: 'B', fromItemId: 'reluctant', origin: 'expand' })
  const q = await buildSessionQueue(db, now)
  expect(q.items.map((i) => i.card.itemId)).toContain('reluctance')
})

test('eliminata la canzone: le voci di Espandi già ripassate restano nel profilo come note, le altre escono', async () => {
  await db.songs.add(song('A'))
  await db.words.add(word('reluctant')); await reviewed(db, 'reluctant')
  await db.words.add(word('reluctance', { contexts: [], origin: 'expand', fromItemId: 'reluctant' })); await reviewed(db, 'reluctance')
  await db.words.add(word('reluctantly', { contexts: [], origin: 'expand', fromItemId: 'reluctant' })); await db.cards.bulkAdd(newCardPair('word', 'reluctantly', now))
  await deleteSong(db, 'A')
  const left = Object.fromEntries((await db.words.toArray()).map((w) => [w.lemma, w.triage]))
  expect(left).toEqual({ reluctant: 'known', reluctance: 'known' })
  expect(await db.cards.count()).toBe(0)
})
