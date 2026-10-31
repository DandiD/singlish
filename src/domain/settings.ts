import type { SinglishDB } from '../db/db'
import type { Level, Settings } from '../db/types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  apiKey: '',
  model: 'gemini-flash-lite-latest',
  theme: 'auto',
  level: 'B1',
  bandStart: 2000,
  bandEnd: 5000,
  desiredRetention: 0.9,
  newPerDay: 16,
  timerMinutes: { study: 15, review: 30 },
  persistAsked: false,
}

const BANDS: Record<Level, [number, number]> = {
  B1: [2000, 5000],
  B2: [3000, 8000],
  C1: [6000, 15000],
}

export function bandForLevel(level: Level): [number, number] {
  const [a, b] = BANDS[level]
  return [a, b]
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export async function getSettings(db: SinglishDB): Promise<Settings> {
  const row = await db.settings.get('settings')
  return row ?? structuredClone(DEFAULT_SETTINGS)
}

export async function saveSettings(
  db: SinglishDB,
  patch: Partial<Omit<Settings, 'id'>>,
): Promise<Settings> {
  const current = await getSettings(db)
  const next: Settings = { ...current, ...patch, id: 'settings' }
  if (patch.level !== undefined && patch.level !== current.level) {
    const [start, end] = bandForLevel(patch.level)
    if (patch.bandStart === undefined) next.bandStart = start
    if (patch.bandEnd === undefined) next.bandEnd = end
  }
  next.desiredRetention = clamp(next.desiredRetention, 0.85, 0.95)
  next.newPerDay = clamp(next.newPerDay, 1, 40)
  await db.settings.put(next)
  return next
}
