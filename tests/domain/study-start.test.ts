import { expect, test } from 'vitest'
import { createDb } from '../../src/db/db'
import { startStudying } from '../../src/domain/finalListen'
import type { Song } from '../../src/db/types'

test('iniziare a studiare segna la data, una volta sola', async () => {
  const db = createDb('t-' + crypto.randomUUID())
  const s: Song = { id: 's', kind: 'song', title: 't', artist: '', spotifyUrl: null, lines: ['x'], status: 'analyzed', level: 'B1', difficultyKnownPct: 70,
    comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: new Date(0), analyzedAt: new Date(0) }
  await db.songs.add(s)
  const t1 = new Date('2026-11-01T10:00:00'), t2 = new Date('2026-11-03T10:00:00')
  await startStudying(db, 's', t1)
  await startStudying(db, 's', t2)
  expect(await db.songs.get('s')).toMatchObject({ status: 'studying', studyStartedAt: t1 })
})
