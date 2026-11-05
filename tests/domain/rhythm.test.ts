import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import {
  RHYTHM_GOAL_DEFAULT, localDayKey, loadWeekRhythm, markFreeDay, reviewDaysSince, rhythmGoalOf, rhythmText, weekRhythm, weekStart,
} from '../../src/domain/rhythm'
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../src/domain/settings'
import type { Review } from '../../src/db/types'

let db: SinglishDB
beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
})
afterEach(() => {
  db.close()
})

const rev = (id: string, at: Date): Review => ({ id, cardId: 'c', rating: 3, auto: false, answer: null, elapsedMs: 1, reviewedAt: at, wasNew: false })

test('localDayKey is local YYYY-MM-DD', () => {
  expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  expect(localDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
})

test('weekStart: Wednesday, Sunday, year boundary', () => {
  expect(localDayKey(weekStart(new Date(2026, 10, 4, 15)))).toBe('2026-11-02') // mer 4 nov
  const sun = weekStart(new Date(2026, 10, 8, 23))
  expect(localDayKey(sun)).toBe('2026-11-02') // dom 8 nov -> lunedì prima
  expect(sun.getHours()).toBe(0)
  expect(localDayKey(weekStart(new Date(2027, 0, 1, 10)))).toBe('2026-12-28')
})

// Si appoggia su TZ=Europe/Rome dello script npm (il cambio d'ora cade nella settimana provata).
const inRome = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Rome'
const dstTest = inRome ? test : test.skip

dstTest('week containing the DST end (19-25 Oct 2026, Rome) has 7 consecutive keys', () => {
  const now = new Date(2026, 9, 25, 23)
  expect(localDayKey(weekStart(now))).toBe('2026-10-19')
  const r = weekRhythm({ reviewDays: new Set(), freeDays: [], goal: 5, now })
  expect(r.days.map((d) => d.key)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
})

dstTest('week containing the DST start (23-29 Mar 2026, Rome) has 7 consecutive keys', () => {
  const now = new Date(2026, 2, 29, 23, 30)
  expect(localDayKey(weekStart(now))).toBe('2026-03-23')
  const r = weekRhythm({ reviewDays: new Set(), freeDays: [], goal: 5, now })
  expect(r.days.map((d) => d.key)).toEqual(['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29'])
})

test('week across the year boundary', () => {
  const r = weekRhythm({ reviewDays: new Set(), freeDays: [], goal: 5, now: new Date(2027, 0, 1, 9) })
  expect(r.days.map((d) => d.key)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
})

test('weekRhythm counts review days and free days up to today', () => {
  const r = weekRhythm({
    reviewDays: new Set(['2026-11-02', '2026-11-04']),
    freeDays: ['2026-11-03', '2026-11-06'], // venerdì futuro: non conta
    goal: 5,
    now: new Date(2026, 10, 5, 10), // giovedì
  })
  expect(r.active).toBe(3)
  expect(r.reached).toBe(false)
  expect(r.days.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  expect(r.days.map((d) => d.active)).toEqual([true, true, true, false, false, false, false])
  expect(r.days[1]!.free).toBe(true)
  expect(r.days[3]!.today).toBe(true)
  expect(r.days.map((d) => d.future)).toEqual([false, false, false, false, true, true, true])
})

test('reached at 5 of 5', () => {
  const r = weekRhythm({
    reviewDays: new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']),
    freeDays: [], goal: 5, now: new Date(2026, 10, 6, 10),
  })
  expect(r.active).toBe(5)
  expect(r.reached).toBe(true)
})

test('rhythmText: singular, normal, reached beyond goal', () => {
  const base = { reviewDays: new Set(['2026-11-02']), freeDays: [] as string[], goal: 5, now: new Date(2026, 10, 5) }
  expect(rhythmText(weekRhythm(base))).toBe('1 giorno su 5')
  expect(rhythmText(weekRhythm({ ...base, reviewDays: new Set(['2026-11-02', '2026-11-03', '2026-11-04']) }))).toBe('3 giorni su 5')
  const over = weekRhythm({ ...base, reviewDays: new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']), goal: 3 })
  expect(rhythmText(over)).toBe('Obiettivo della settimana raggiunto · 4 giorni')
})

test('rhythmGoalOf defaults to 5', () => {
  expect(RHYTHM_GOAL_DEFAULT).toBe(5)
  expect(rhythmGoalOf({ ...DEFAULT_SETTINGS })).toBe(5)
  expect(rhythmGoalOf({ ...DEFAULT_SETTINGS, rhythmGoal: 3 })).toBe(3)
})

test('rhythmGoalOf falls back to 5 for stored values that are not an integer 3..7', () => {
  for (const bad of [0, NaN, 'x', 9, 2, 4.5, null]) {
    expect(rhythmGoalOf({ ...DEFAULT_SETTINGS, rhythmGoal: bad as unknown as number })).toBe(5)
  }
  expect(rhythmGoalOf({ ...DEFAULT_SETTINGS, rhythmGoal: 7 })).toBe(7)
})

test('saveSettings does not propagate NaN for rhythmGoal', async () => {
  expect((await saveSettings(db, { rhythmGoal: NaN })).rhythmGoal).toBeUndefined()
  await saveSettings(db, { rhythmGoal: 4 })
  expect((await saveSettings(db, { rhythmGoal: NaN })).rhythmGoal).toBe(4)
})

test('saveSettings clamps rhythmGoal to 3..7 integer', async () => {
  expect((await saveSettings(db, { rhythmGoal: 9 })).rhythmGoal).toBe(7)
  expect((await saveSettings(db, { rhythmGoal: 2 })).rhythmGoal).toBe(3)
  expect((await saveSettings(db, { rhythmGoal: 4.6 })).rhythmGoal).toBe(5)
})

test('saveSettings without rhythmGoal leaves it absent', async () => {
  expect((await saveSettings(db, { newPerDay: 10 })).rhythmGoal).toBeUndefined()
})

test('reviewDaysSince collects local day keys from since', async () => {
  await db.reviews.bulkAdd([
    rev('a', new Date(2026, 10, 1, 23, 30)),
    rev('b', new Date(2026, 10, 2, 0, 10)),
    rev('c', new Date(2026, 10, 2, 22, 0)),
    rev('d', new Date(2026, 10, 4, 8, 0)),
  ])
  const days = await reviewDaysSince(db, new Date(2026, 10, 2))
  expect([...days].sort()).toEqual(['2026-11-02', '2026-11-04'])
})

test('markFreeDay adds once and does not rewrite', async () => {
  await markFreeDay(db, new Date(2026, 10, 5, 9))
  expect((await getSettings(db)).freeDays).toEqual(['2026-11-05'])
  const spy = vi.spyOn(db.settings, 'put')
  await markFreeDay(db, new Date(2026, 10, 5, 18))
  expect(spy).not.toHaveBeenCalled()
  expect((await getSettings(db)).freeDays).toEqual(['2026-11-05'])
})

test('markFreeDay keeps only the last 84 days', async () => {
  const days: string[] = []
  for (let i = 0; i < 90; i++) days.push(localDayKey(new Date(2026, 5, 1 + i)))
  await saveSettings(db, { freeDays: days })
  await markFreeDay(db, new Date(2026, 10, 5, 9))
  const free = (await getSettings(db)).freeDays!
  expect(free).toHaveLength(84)
  expect(free[free.length - 1]).toBe('2026-11-05')
  expect(free).not.toContain(days[0]!)
})

test('loadWeekRhythm composes reviews, free days and goal; old settings give goal 5', async () => {
  await db.reviews.add(rev('a', new Date(2026, 10, 2, 10)))
  await markFreeDay(db, new Date(2026, 10, 3, 10))
  const r = await loadWeekRhythm(db, new Date(2026, 10, 5, 10))
  expect(r.goal).toBe(5)
  expect(r.active).toBe(2)
})
