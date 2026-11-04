import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { buildSessionQueue } from '../../src/domain/queue'
import { newFsrsCard, recordReview } from '../../src/domain/scheduler'
import { startTimer } from '../../src/domain/timer'
import type { Chunk, Song } from '../../src/db/types'

const t0 = new Date('2026-11-04T10:00:00')
const song: Song = { id: 's1', kind: 'song', title: 'S', artist: '', spotifyUrl: null, lines: ['a b', 'c d'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: t0, analyzedAt: t0 }
const chunk = (id: string, line: number): Chunk => ({ id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: line, contexts: [{ songId: 's1', lineIndex: line }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'x', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await db.songs.add(song)
  await db.chunks.bulkAdd([chunk('c1', 0), chunk('c2', 1)])
  await db.cards.bulkAdd([
    { id: 'r1', itemType: 'chunk', itemId: 'c1', kind: 'R', unlocked: 1, due: t0, fsrs: newFsrsCard(t0), goodRCount: 0 },
    { id: 'r2', itemType: 'chunk', itemId: 'c2', kind: 'R', unlocked: 1, due: t0, fsrs: newFsrsCard(t0), goodRCount: 0 },
  ])
})

test('sessione aperta che nasconde tutto ciò che resta: la coda torna a mostrare le card sbagliate, e segnala la sessione da chiudere', async () => {
  await db.sessions.add({ id: 'open', kind: 'review', songId: null, startedAt: t0, endedAt: null, timer: startTimer(30 * 60_000, t0.getTime()), reviewsDone: 0, newDone: 1 })
  const t1 = new Date(t0.getTime() + 60_000)
  await recordReview(db, 'r1', { rating: 1, auto: false, answer: null, elapsedMs: 1000 }, t1, 0.9)
  await db.chunks.update('c2', { suspended: true }) // l'unica card rimasta sparisce
  const q = await buildSessionQueue(db, new Date(t0.getTime() + 20 * 60_000))
  expect(q.items.map((i) => i.card.id)).toEqual(['r1'])
  expect(q.openSession).toBeNull()
  expect(q.staleSession?.id).toBe('open')
})

test('senza card nascoste la sessione aperta resta quella', async () => {
  await db.sessions.add({ id: 'open', kind: 'review', songId: null, startedAt: t0, endedAt: null, timer: startTimer(30 * 60_000, t0.getTime()), reviewsDone: 0, newDone: 0 })
  const q = await buildSessionQueue(db, new Date(t0.getTime() + 60_000))
  expect(q.openSession?.id).toBe('open')
  expect(q.staleSession).toBeUndefined()
})
