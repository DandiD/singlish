import type { SinglishDB } from '../db/db'
import type { Settings } from '../db/types'
import { getSettings, saveSettings } from './settings'

export const RHYTHM_GOAL_DEFAULT = 5
/** I giorni liberi si tengono per 12 settimane. */
const FREE_DAYS_KEPT = 84

export const rhythmGoalOf = (s: Settings): number => {
  const g: unknown = s.rhythmGoal
  return typeof g === 'number' && Number.isInteger(g) && g >= 3 && g <= 7 ? g : RHYTHM_GOAL_DEFAULT
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Giorno nel fuso locale, `YYYY-MM-DD`. */
export const localDayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Lunedì 00:00 locale della settimana di `now` (calcolo sul calendario, non in millisecondi: regge l'ora legale). */
export function weekStart(now: Date): Date {
  const back = (now.getDay() + 6) % 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
}

export type RhythmDay = { key: string; weekday: number; active: boolean; free: boolean; today: boolean; future: boolean }
export type WeekRhythm = { days: RhythmDay[]; active: number; goal: number; reached: boolean }

export function weekRhythm(input: { reviewDays: Set<string>; freeDays: string[]; goal: number; now: Date }): WeekRhythm {
  const { reviewDays, freeDays, goal, now } = input
  const start = weekStart(now)
  const todayKey = localDayKey(now)
  const free = new Set(freeDays)
  const days: RhythmDay[] = []
  for (let i = 0; i < 7; i++) {
    const key = localDayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    const future = key > todayKey
    const isFree = !future && free.has(key)
    days.push({ key, weekday: i, active: !future && (reviewDays.has(key) || isFree), free: isFree, today: key === todayKey, future })
  }
  const active = days.filter((d) => d.active).length
  return { days, active, goal, reached: active >= goal }
}

export function rhythmText(r: WeekRhythm): string {
  const unit = r.active === 1 ? 'giorno' : 'giorni'
  if (r.reached) return `Obiettivo della settimana raggiunto · ${r.active} ${unit}`
  return `${r.active} ${unit} su ${r.goal}`
}

/** Chiavi dei giorni con almeno un ripasso, da `since` in poi. */
export async function reviewDaysSince(db: SinglishDB, since: Date): Promise<Set<string>> {
  const out = new Set<string>()
  await db.reviews.where('reviewedAt').aboveOrEqual(since).each((r) => {
    out.add(localDayKey(r.reviewedAt))
  })
  return out
}

/** Segna `now` come giorno libero; non scrive se c'è già. Tiene solo gli ultimi 84 giorni. */
export async function markFreeDay(db: SinglishDB, now: Date): Promise<void> {
  const key = localDayKey(now)
  await db.transaction('rw', db.settings, async () => {
    const current = (await getSettings(db)).freeDays ?? []
    if (current.includes(key)) return
    const next = [...current, key].sort().slice(-FREE_DAYS_KEPT)
    await saveSettings(db, { freeDays: next })
  })
}

export async function loadWeekRhythm(db: SinglishDB, now: Date): Promise<WeekRhythm> {
  const [settings, reviewDays] = await Promise.all([getSettings(db), reviewDaysSince(db, weekStart(now))])
  return weekRhythm({ reviewDays, freeDays: settings.freeDays ?? [], goal: rhythmGoalOf(settings), now })
}

const parseDayKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Settimane lun–dom (fino a quella di `now`) con almeno `goal` giorni attivi; `fourInARow` = quattro di fila. */
export function weeksReached(dayKeys: Set<string>, goal: number, now: Date): { any: boolean; fourInARow: boolean } {
  const keys = [...dayKeys].sort()
  if (!keys.length) return { any: false, fourInARow: false }
  const perWeek = new Map<string, number>()
  for (const k of keys) {
    const w = localDayKey(weekStart(parseDayKey(k)))
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
  }
  const last = weekStart(now)
  let any = false
  let run = 0
  let fourInARow = false
  // Calendario, non millisecondi: la settimana dopo è sempre lunedì + 7 giorni, anche col cambio d'ora.
  for (let w = weekStart(parseDayKey(keys[0])); w <= last; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    if ((perWeek.get(localDayKey(w)) ?? 0) >= goal) {
      any = true
      if (++run >= 4) fourInARow = true
    } else run = 0
  }
  return { any, fourInARow }
}
