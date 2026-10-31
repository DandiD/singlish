import { afterEach, beforeEach, expect, test } from 'vitest'
import { createEmptyCard } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { exportBackup, importBackup, backupFileName } from '../../src/domain/backup'
import { getSettings, saveSettings } from '../../src/domain/settings'
import type { Chunk, Song, Word } from '../../src/db/types'

let db: SinglishDB
const dbs: SinglishDB[] = []
const now = new Date('2026-10-31T10:00:00Z')

function mk(): SinglishDB {
  const d = createDb('t-' + crypto.randomUUID())
  dbs.push(d)
  return d
}

beforeEach(async () => {
  db = mk()
  const song: Song = {
    id: 's1', kind: 'song', title: 'T', artist: 'A', spotifyUrl: null, lines: ['one line'],
    status: 'analyzed', level: 'B1', difficultyKnownPct: null, comprehensionBefore: null,
    grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
  }
  const chunk: Chunk = {
    id: 'c1', songId: 's1', key: 'k', baseForm: 'b', surfaceForm: 'b', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable',
    topic: 't', meaningIt: 'm', explanationIt: 'e', extraExampleEn: 'x', productionPromptIt: 'p',
    pronunciationNoteIt: 'n', userEdited: false, suspended: false,
  }
  const fsrs = { ...createEmptyCard(now), last_review: now }
  await db.songs.add(song)
  await db.chunks.add(chunk)
  await db.cards.bulkAdd([
    { id: 'k1', itemType: 'chunk', itemId: 'c1', kind: 'R', unlocked: 1, due: now, fsrs, goodRCount: 0 },
    { id: 'k2', itemType: 'chunk', itemId: 'c1', kind: 'C', unlocked: 0, due: now, fsrs: createEmptyCard(now), goodRCount: 0 },
  ])
  await db.reviews.add({
    id: 'r1', cardId: 'k1', rating: 3, auto: true, answer: null, elapsedMs: 100, reviewedAt: now, wasNew: true,
  })
  await db.sessions.add({
    id: 'x1', kind: 'study', songId: 's1', startedAt: now, endedAt: null,
    timer: { status: 'idle', durationMs: 1, accumulatedMs: 0, resumedAt: null }, reviewsDone: 0, newDone: 0,
  })
  await saveSettings(db, { apiKey: 'secret-key' })
})
afterEach(() => {
  dbs.forEach((d) => d.close())
  dbs.length = 0
})

test('round trip keeps data and dates, never exports the key', async () => {
  const file = await exportBackup(db, now)
  expect(file.exportedAt).toBe(now.toISOString())
  expect(JSON.stringify(file)).not.toContain('secret-key')
  const db2 = mk()
  await saveSettings(db2, { apiKey: 'other' })
  await importBackup(db2, JSON.parse(JSON.stringify(file)))
  expect(await db2.cards.count()).toBe(await db.cards.count())
  expect((await db2.cards.toArray())[0].due).toBeInstanceOf(Date)
  expect((await getSettings(db2)).apiKey).toBe('other')
})

test('revives nested dates', async () => {
  const file = await exportBackup(db, now)
  const db2 = mk()
  await importBackup(db2, JSON.parse(JSON.stringify(file)))
  const card = await db2.cards.get('k1')
  expect(card!.fsrs.due).toBeInstanceOf(Date)
  expect(card!.fsrs.last_review).toBeInstanceOf(Date)
  expect((await db2.reviews.get('r1'))!.reviewedAt).toBeInstanceOf(Date)
  expect((await db2.songs.get('s1'))!.addedAt.getTime()).toBe(now.getTime())
  expect((await db2.sessions.get('x1'))!.endedAt).toBeNull()
})

test('rejects foreign files', async () => {
  await expect(importBackup(db, { app: 'x' })).rejects.toThrow('Backup non valido')
})

test('rejects wrong version', async () => {
  const file = await exportBackup(db, now)
  await expect(importBackup(db, { ...file, version: 2 })).rejects.toThrow('Backup non valido')
  expect(await db.cards.count()).toBe(2)
})

test('import replaces existing data', async () => {
  const file = await exportBackup(db, now)
  const db2 = mk()
  await db2.words.add({ id: 'w9', lemma: 'zzz' } as Word)
  await db2.songs.add({ ...(await db.songs.get('s1'))!, id: 'old' })
  await importBackup(db2, JSON.parse(JSON.stringify(file)))
  expect(await db2.words.count()).toBe(0)
  expect(await db2.songs.count()).toBe(1)
  expect(await db2.songs.get('old')).toBeUndefined()
  expect(await db2.chunks.count()).toBe(1)
  expect(await db2.reviews.count()).toBe(1)
  expect(await db2.sessions.count()).toBe(1)
  expect(await db2.settings.count()).toBe(1)
})

test('backup file name uses the local date', () => {
  expect(backupFileName(new Date(2026, 9, 31, 23, 30).toISOString())).toBe('singlish-backup-2026-10-31.json')
})
