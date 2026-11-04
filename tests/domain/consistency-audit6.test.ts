import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { buildSessionQueue } from '../../src/domain/queue'
import { saveProduction, confirmProductions } from '../../src/domain/production'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import type { Chunk, Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song: Song = { id: 'A', kind: 'song', title: 'A', artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const chunk = (id: string): Chunk => ({ id, songId: 'A', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }], type: 'idiom',
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: 'x', pronunciationNoteIt: '', userEdited: false, suspended: false })
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await saveSettings(db, { newPerDay: 3 })
  await db.songs.add(song)
  for (const id of ['c1', 'c2', 'c3', 'c4']) { await db.chunks.add(chunk(id)); await db.cards.bulkAdd(newCardPair('chunk', id, now)) }
  await db.cards.add({ id: 'p1', itemType: 'chunk', itemId: 'c1', kind: 'P', unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
})

test('una frase scritta su una card Produci nuova conta subito fra le nuove del giorno', async () => {
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'x', elapsedMs: 1, wasNew: true, at: now })
  expect((await buildSessionQueue(db, now)).newCount).toBe(2) // 3 al giorno, 1 già usata dalla frase
})

test('confermata più tardi, la frase non conta due volte e resta nel giorno in cui è stata scritta', async () => {
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'x', elapsedMs: 1, wasNew: true, at: now })
  const later = new Date(now.getTime() + 2 * 3600000)
  await confirmProductions(db, [{ sessionId: 'r1', cardId: 'p1', sentence: 'x', elapsedMs: 1, rating: 3, wasNew: true, at: now }], later, 0.9)
  expect((await buildSessionQueue(db, later)).newCount).toBe(2)
  expect((await db.reviews.toArray())[0].reviewedAt).toEqual(now)
  expect((await db.sessions.get('r1'))).toMatchObject({ newDone: 1, reviewsDone: 0 })
})
