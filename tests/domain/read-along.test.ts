import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { readingLines, saveReadAlong } from '../../src/domain/readAlong'
import type { Song } from '../../src/db/types'

const now = new Date('2026-11-05T10:00:00')
const song = (id: string, over: Partial<Song> = {}): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now, ...over,
})
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('le righe vuote e di soli spazi si saltano, con il lineIndex originale', () => {
  const r = readingLines({ lines: ['  first  ', '', '   ', 'second', '\t'] })
  expect(r).toEqual([
    { lineIndex: 0, text: 'first', chorus: false },
    { lineIndex: 3, text: 'second', chorus: false },
  ])
})

test('il ritornello si riconosce con apostrofi curvi e maiuscole diverse', () => {
  const r = readingLines({ lines: ["Don't stop me now", 'verse one', "don’t STOP me now!", 'verse two'] })
  expect(r.map((l) => l.chorus)).toEqual([true, false, true, false])
})

test('una riga unica ripetuta tre volte: tutte chorus', () => {
  const r = readingLines({ lines: ['la la la', 'la la la', 'la la la'] })
  expect(r).toHaveLength(3)
  expect(r.every((l) => l.chorus)).toBe(true)
})

test('senza ripetizioni nessun ritornello', () => {
  expect(readingLines({ lines: ['a b', 'c d'] }).some((l) => l.chorus)).toBe(false)
})

test('saveReadAlong salva la data in una canzone analizzata, in studio o completata', async () => {
  await db.songs.bulkAdd([song('a', { status: 'analyzed' }), song('s'), song('d', { status: 'done' })])
  for (const id of ['a', 's', 'd']) await saveReadAlong(db, id, now)
  for (const id of ['a', 's', 'd']) expect((await db.songs.get(id))!.readAlongAt).toEqual(now)
})

test('saveReadAlong non tocca una bozza o una canzone in coda', async () => {
  await db.songs.bulkAdd([song('b', { status: 'draft' }), song('q', { status: 'queued' })])
  await saveReadAlong(db, 'b', now)
  await saveReadAlong(db, 'q', now)
  expect((await db.songs.get('b'))!.readAlongAt).toBeUndefined()
  expect((await db.songs.get('q'))!.readAlongAt).toBeUndefined()
})
