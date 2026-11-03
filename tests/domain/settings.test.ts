import { afterEach, beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { DEFAULT_SETTINGS, bandForLevel, getSettings, saveSettings, seedApiKey } from '../../src/domain/settings'

let db: SinglishDB
beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
})
afterEach(() => {
  db.close()
})

test('defaults when empty', async () => {
  expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS)
  expect(await db.settings.count()).toBe(0)
})
test('bands per level', () => {
  expect(bandForLevel('B1')).toEqual([2000, 5000])
  expect(bandForLevel('B2')).toEqual([3000, 8000])
  expect(bandForLevel('C1')).toEqual([6000, 15000])
})
test('changing level moves the band', async () => {
  const s = await saveSettings(db, { level: 'B2' })
  expect([s.bandStart, s.bandEnd]).toEqual([3000, 8000])
  expect(await getSettings(db)).toEqual(s)
})
test('explicit band wins over level', async () => {
  const s = await saveSettings(db, { level: 'C1', bandStart: 100, bandEnd: 200 })
  expect([s.bandStart, s.bandEnd]).toEqual([100, 200])
})
test('clamps retention and newPerDay', async () => {
  const s = await saveSettings(db, { desiredRetention: 0.99, newPerDay: 0 })
  expect(s.desiredRetention).toBe(0.95)
  expect(s.newPerDay).toBe(1)
  const t = await saveSettings(db, { desiredRetention: 0.5, newPerDay: 99 })
  expect(t.desiredRetention).toBe(0.85)
  expect(t.newPerDay).toBe(40)
})
test('patch merges over current', async () => {
  await saveSettings(db, { apiKey: 'k' })
  const s = await saveSettings(db, { theme: 'dark' })
  expect(s.apiKey).toBe('k')
  expect(s.theme).toBe('dark')
})

test('newPerDay is a whole number of cards', async () => {
  expect((await saveSettings(db, { newPerDay: 2.5 })).newPerDay).toBe(3)
  expect((await saveSettings(db, { newPerDay: 12.2 })).newPerDay).toBe(12)
})
test('seedApiKey stores the env key when none is saved', async () => {
  await seedApiKey(db, '  fake-env-key  ')
  expect((await getSettings(db)).apiKey).toBe('fake-env-key')
})
test('seedApiKey never overwrites a saved key', async () => {
  await saveSettings(db, { apiKey: 'saved-key' })
  await seedApiKey(db, 'fake-env-key')
  expect((await getSettings(db)).apiKey).toBe('saved-key')
})
test('seedApiKey does nothing without an env key', async () => {
  await seedApiKey(db, undefined)
  await seedApiKey(db, '   ')
  expect(await db.settings.count()).toBe(0)
})
test('concurrent saves do not clobber the seeded key', async () => {
  await Promise.all([seedApiKey(db, 'fake-env-key'), saveSettings(db, { persistAsked: true })])
  const s = await getSettings(db)
  expect(s.apiKey).toBe('fake-env-key')
  expect(s.persistAsked).toBe(true)
})
