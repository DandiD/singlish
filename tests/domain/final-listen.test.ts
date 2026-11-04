import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { finalListenDue, saveFinalListen, averageGain, FINAL_LISTEN_DAYS } from '../../src/domain/finalListen'
import type { Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
const song = (id: string, over: Partial<Song> = {}): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [], addedAt: daysAgo(30), analyzedAt: daysAgo(30), ...over,
})
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test(`il riascolto si propone dopo ${FINAL_LISTEN_DAYS} giorni di studio, una volta sola`, () => {
  const songs = [
    song('pronta', { studyStartedAt: daysAgo(8) }),
    song('presto', { studyStartedAt: daysAgo(3) }),
    song('fatto', { studyStartedAt: daysAgo(20), comprehensionAfter: 80 }),
    song('rimandata', { status: 'analyzed' }),
    song('vecchia'), // senza data di inizio studio: vale l'analisi
  ]
  expect(finalListenDue(songs, now).map((s) => s.id)).toEqual(['vecchia', 'pronta'])
})

test('salvare il riascolto registra la % dopo e completa la canzone', async () => {
  await db.songs.add(song('s1', { studyStartedAt: daysAgo(8) }))
  await saveFinalListen(db, 's1', 78, now)
  expect(await db.songs.get('s1')).toMatchObject({ comprehensionAfter: 78, finalListenAt: now, status: 'done' })
})

test('guadagno medio: solo le canzoni con prima e dopo', () => {
  const songs = [song('a', { comprehensionBefore: 60, comprehensionAfter: 78 }), song('b', { comprehensionBefore: 40, comprehensionAfter: 54 }), song('c', { comprehensionBefore: null, comprehensionAfter: 90 }), song('d')]
  expect(averageGain(songs)).toBe(16)
  expect(averageGain([song('d')])).toBeNull()
})
