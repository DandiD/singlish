import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { saveProduction, pendingProductions } from '../../src/domain/production'
import { deleteSong } from '../../src/domain/ingest'
import { exportBackup, importBackup } from '../../src/domain/backup'
import { finalListenDue } from '../../src/domain/finalListen'
import { newCardPair } from '../../src/domain/scheduler'
import type { Chunk, Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song: Song = { id: 's1', kind: 'song', title: 'T', artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: 40, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now, studyStartedAt: new Date('2026-10-20T10:00:00'),
  chorusDoneAt: new Date('2026-10-25T10:00:00') }
const chunk: Chunk = { id: 'c1', songId: 's1', key: 'k', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: 'x', pronunciationNoteIt: '', userEdited: false, suspended: false }
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await db.songs.add(song); await db.chunks.add(chunk)
  await db.cards.bulkAdd(newCardPair('chunk', 'c1', now))
  await db.cards.add({ ...newCardPair('chunk', 'c1', now)[0], id: 'p1', kind: 'P' })
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'I let it slide.', elapsedMs: 1 })
})

test('eliminata la canzone, la sua frase non resta «da correggere» per sempre', async () => {
  await deleteSong(db, 's1')
  expect(await pendingProductions(db)).toEqual([])
})

test('escluso il chunk, la sua frase sparisce dall\'elenco da correggere', async () => {
  await db.cards.where('itemId').equals('c1').delete(); await db.chunks.delete('c1')
  expect(await pendingProductions(db)).toEqual([])
})

test('il backup riporta come date anche inizio studio, riascolto e ritornello', async () => {
  const file = JSON.parse(JSON.stringify(await exportBackup(db, now)))
  await importBackup(db, file)
  const s = (await db.songs.get('s1'))!
  expect(s.studyStartedAt).toBeInstanceOf(Date)
  expect(s.chorusDoneAt).toBeInstanceOf(Date)
  expect(finalListenDue([s], now).map((x) => x.id)).toEqual(['s1'])
})
