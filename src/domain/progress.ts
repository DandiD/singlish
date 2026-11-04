import { State } from 'ts-fsrs'
import type { CardRow, Chunk, Level, Review, Settings, Song, Word } from '../db/types'
import { dueItemsWithin } from './readiness'

const NEXT: Record<Level, Level | null> = { B1: 'B2', B2: 'C1', C1: null }
/** Per proporre il livello successivo: voci attive del livello attuale e comprensione al primo ascolto. */
export const LEVEL_UP = { active: 150, comprehension: 70 }
const DAY = 86_400_000

export interface ProgressStats {
  comprehension: { title: string; pct: number }[]
  currentComprehension: number | null
  active: number
  activeAtLevel: number
  retention: number | null
  loadMinutesPerDay: number
  nextLevel: Level | null
  levelProgress: number
}

/** I numeri di Progressi, tutti dai dati salvati sul dispositivo. */
export function progressStats(
  d: { settings: Settings; songs: Song[]; chunks: Chunk[]; words?: Word[]; cards: CardRow[]; reviews: Review[]; avgSeconds: number },
  now: Date,
): ProgressStats {
  const comprehension = [...d.songs]
    .filter((s) => s.comprehensionBefore !== null)
    .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
    .map((s) => ({ title: s.title, pct: s.comprehensionBefore as number }))
  const currentComprehension = comprehension.at(-1)?.pct ?? null

  const items = new Map<string, Chunk | Word>([...d.chunks, ...(d.words ?? [])].map((i) => [i.id, i]))
  const live = (c: CardRow) => { const i = items.get(c.itemId); return !!i && !i.suspended }
  const activeIds = new Set(
    d.cards.filter((c) => c.kind === 'C' && c.unlocked === 1 && c.fsrs.state === State.Review && live(c)).map((c) => c.itemId),
  )
  const activeAtLevel = [...activeIds].filter((id) => items.get(id)?.cefr === d.settings.level).length

  const recent = d.reviews.filter((r) => !r.wasNew && r.reviewedAt.getTime() > now.getTime() - 30 * DAY && r.reviewedAt <= now)
  const retention = recent.length ? recent.filter((r) => r.rating !== 1).length / recent.length : null

  const liveIds = new Set([...items.values()].filter((i) => !i.suspended).map((i) => i.id))
  const due7 = dueItemsWithin(d.cards, liveIds, now, 7)
  const loadMinutesPerDay = (due7 * d.avgSeconds) / 60 / 7

  const nextLevel = NEXT[d.settings.level]
  const levelProgress =
    Math.min(activeAtLevel / LEVEL_UP.active, 1) * 0.5 + Math.min((currentComprehension ?? 0) / LEVEL_UP.comprehension, 1) * 0.5

  return { comprehension, currentComprehension, active: activeIds.size, activeAtLevel, retention, loadMinutesPerDay, nextLevel, levelProgress }
}
