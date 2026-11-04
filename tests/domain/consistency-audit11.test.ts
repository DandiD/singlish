import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { repairHomes, deleteSong } from '../../src/domain/ingest'
import { exportBackup, importBackup } from '../../src/domain/backup'
import type { Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song = (id: string, lines: string[]): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines, status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now })
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('la riparazione all\'apertura sposta anche le voci di Espandi insieme alla loro parola', async () => {
  await db.words.bulkAdd([word('rely', { songId: 'gone', contexts: [{ songId: 'Y', lineIndex: 3 }] }), word('reliable', { songId: 'gone', contexts: [], origin: 'expand', fromItemId: 'rely' })])
  await repairHomes(db)
  expect(await db.words.get('reliable')).toMatchObject({ songId: 'Y', lineIndex: 3 })
})

test('eliminando la canzone d\'origine, gli altri versi conservano la loro forma', async () => {
  await db.songs.bulkAdd([song('A', ['I picked up the phone']), song('C', ['picking up the pieces']), song('B', ['she picked up the keys'])])
  const c: Chunk = { id: 'c1', songId: 'A', key: 'pick up', baseForm: 'pick up', surfaceForm: 'picked up', lineIndex: 0,
    contexts: [{ songId: 'A', lineIndex: 0 }, { songId: 'C', lineIndex: 0, surfaceForm: 'picking up' }, { songId: 'B', lineIndex: 0 }],
    type: 'phrasal_verb', cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false }
  await db.chunks.add(c)
  await deleteSong(db, 'A')
  const after = (await db.chunks.get('c1'))!
  expect(after.surfaceForm).toBe('picking up')
  expect(after.contexts.find((x) => x.songId === 'B')!.surfaceForm).toBe('picked up')
})

test('importando un backup vecchio, la riparazione gira subito', async () => {
  await db.words.add(word('wander', { songId: 'gone', contexts: [{ songId: 'B', lineIndex: 2 }] }))
  const file = JSON.parse(JSON.stringify(await exportBackup(db, now)))
  await importBackup(db, file)
  expect(await db.words.get('wander')).toMatchObject({ songId: 'B', lineIndex: 2 })
})
