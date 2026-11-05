import type { SinglishDB } from '../db/db'
import { LEVEL_UP, progressStats } from './progress'
import { estimateAvgSeconds } from './queue'
import { reviewDaysSince, rhythmGoalOf, weeksReached } from './rhythm'
import { getSettings, saveSettings } from './settings'
import { rCardStates, unlockedBySong } from './unlocked'

export type MilestoneId =
  | 'song-all-unlocked' | 'final-gain-20' | 'active-50' | 'active-150' | 'active-500' | 'week-goal' | 'week-goal-4' | 'level-up'
export type Milestone = { id: MilestoneId; title: string; text: string }

export const MILESTONE_ORDER: MilestoneId[] = [
  'song-all-unlocked', 'final-gain-20', 'active-50', 'active-150', 'active-500', 'week-goal', 'week-goal-4', 'level-up',
]

const ACTIVE_TEXT = 'Le usi senza aiuto: le riconosci e le completi.'

/** I traguardi raggiunti ora, ricalcolati dai dati (mai da eventi), nell'ordine di `MILESTONE_ORDER`. */
export async function reachedMilestones(db: SinglishDB, now: Date): Promise<Milestone[]> {
  const [settings, songs, chunks, words, cards, reviews, avgSeconds, rState] = await Promise.all([
    getSettings(db), db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), db.cards.toArray(), db.reviews.toArray(),
    estimateAvgSeconds(db), rCardStates(db),
  ])
  const byAge = [...songs].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
  const per = unlockedBySong(byAge, chunks, words, rState)
  const allUnlocked = byAge.find((s) => {
    const u = per.get(s.id)
    return !!u && u.total > 0 && u.unlocked === u.total
  })
  const gained = byAge.find(
    (s) => s.comprehensionBefore != null && s.comprehensionAfter != null && s.comprehensionAfter - s.comprehensionBefore >= 20,
  )
  const stats = progressStats({ settings, songs, chunks, words, cards, reviews, avgSeconds }, now)

  const dayKeys = new Set([...(await reviewDaysSince(db, new Date(0))), ...(settings.freeDays ?? [])])
  const weeks = weeksReached(dayKeys, rhythmGoalOf(settings), now)

  const out: Record<MilestoneId, Milestone | null> = {
    'song-all-unlocked': allUnlocked
      ? { id: 'song-all-unlocked', title: 'Una canzone tutta capita', text: `Tutti i versi di «${allUnlocked.title}» sono sbloccati.` }
      : null,
    'final-gain-20': gained
      ? { id: 'final-gain-20', title: 'Venti punti in più', text: `Al riascolto finale di «${gained.title}» hai capito 20 punti in più.` }
      : null,
    'active-50': stats.active >= 50 ? { id: 'active-50', title: '50 voci attive', text: ACTIVE_TEXT } : null,
    'active-150': stats.active >= 150 ? { id: 'active-150', title: '150 voci attive', text: ACTIVE_TEXT } : null,
    'active-500': stats.active >= 500 ? { id: 'active-500', title: '500 voci attive', text: ACTIVE_TEXT } : null,
    'week-goal': weeks.any ? { id: 'week-goal', title: 'Una settimana a ritmo', text: "Hai raggiunto l'obiettivo della settimana." } : null,
    'week-goal-4': weeks.fourInARow ? { id: 'week-goal-4', title: 'Quattro settimane di fila', text: "Quattro settimane a ritmo, una dopo l'altra." } : null,
    'level-up':
      stats.nextLevel && stats.activeAtLevel >= LEVEL_UP.active && (stats.currentComprehension ?? 0) >= LEVEL_UP.comprehension
        ? { id: 'level-up', title: `Pronto per il ${stats.nextLevel}`, text: 'Puoi alzare il livello nelle Impostazioni.' }
        : null,
  }
  return MILESTONE_ORDER.map((id) => out[id]).filter((m): m is Milestone => m !== null)
}

/** Salva la data in cui il traguardo è stato mostrato; non sovrascrive una data già salvata. */
export async function markMilestoneSeen(db: SinglishDB, id: MilestoneId, now: Date): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const seen = (await getSettings(db)).milestonesSeen ?? {}
    if (seen[id]) return
    await saveSettings(db, { milestonesSeen: { ...seen, [id]: now } })
  })
}

/** Prima apertura con i traguardi: quelli già raggiunti si segnano come visti oggi. `true` se ha seminato. */
export async function seedMilestonesSeen(db: SinglishDB, now: Date): Promise<boolean> {
  if ((await getSettings(db)).milestonesSeen !== undefined) return false
  const reached = await reachedMilestones(db, now)
  return db.transaction('rw', [db.settings, db.songs, db.chunks, db.words, db.cards, db.reviews], async () => {
    if ((await getSettings(db)).milestonesSeen !== undefined) return false
    await saveSettings(db, { milestonesSeen: Object.fromEntries(reached.map((m) => [m.id, now])) })
    return true
  })
}
