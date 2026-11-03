import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { deleteSong } from '../../src/domain/ingest'
import { newCardPair } from '../../src/domain/scheduler'
import type { Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
let db: SinglishDB
const song = (id: string): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['a', 'b', 'c'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
})
const chunk = (id: string, songId: string, contexts: Chunk['contexts']): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex: contexts[0].lineIndex, contexts, type: 'idiom', cefr: 'B2',
  register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const word = (id: string, songId: string, contexts: Word['contexts'], triage: Word['triage'] = 'learn'): Word => ({
  id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 4000, songId, lineIndex: contexts[0].lineIndex, contexts, cefr: 'B2',
  register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', triage, userEdited: false, suspended: false,
})

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await db.songs.bulkAdd([song('s1'), song('s2')])
  await db.chunks.bulkAdd([
    chunk('solo', 's1', [{ songId: 's1', lineIndex: 0 }]),
    chunk('shared', 's1', [{ songId: 's1', lineIndex: 1 }, { songId: 's2', lineIndex: 2, surfaceForm: 'sharing' }]),
    chunk('other', 's2', [{ songId: 's2', lineIndex: 0 }, { songId: 's1', lineIndex: 2 }]),
  ])
  await db.words.bulkAdd([word('w-solo', 's1', [{ songId: 's1', lineIndex: 0 }]), word('w-pending', 's1', [{ songId: 's1', lineIndex: 1 }], 'pending')])
  for (const id of ['solo', 'shared', 'other']) await db.cards.bulkAdd(newCardPair('chunk', id, now))
  await db.cards.bulkAdd(newCardPair('word', 'w-solo', now))
  const [r] = await db.cards.where('itemId').equals('solo').toArray()
  await db.reviews.add({ id: 'r1', cardId: r.id, rating: 3, auto: false, answer: null, elapsedMs: 5000, reviewedAt: now, wasNew: true })
})

test('le voci solo della canzone spariscono con le loro card; la canzone pure', async () => {
  await deleteSong(db, 's1')
  expect(await db.songs.get('s1')).toBeUndefined()
  expect(await db.chunks.get('solo')).toBeUndefined()
  expect(await db.words.get('w-solo')).toBeUndefined()
  expect(await db.words.get('w-pending')).toBeUndefined()
  expect(await db.cards.where('itemId').anyOf('solo', 'w-solo').count()).toBe(0)
})

test('una voce condivisa resta, senza il verso della canzone eliminata, e prende come origine la canzone che resta', async () => {
  await deleteSong(db, 's1')
  const shared = (await db.chunks.get('shared'))!
  expect(shared.contexts).toEqual([{ songId: 's2', lineIndex: 2, surfaceForm: 'sharing' }])
  expect(shared).toMatchObject({ songId: 's2', lineIndex: 2, surfaceForm: 'sharing' })
  expect(await db.cards.where('itemId').equals('shared').count()).toBe(2)
  const other = (await db.chunks.get('other'))!
  expect(other.contexts).toEqual([{ songId: 's2', lineIndex: 0 }])
  expect(other.songId).toBe('s2')
})

test('i ripassi già fatti restano come storico', async () => {
  await deleteSong(db, 's1')
  expect(await db.reviews.count()).toBe(1)
})
