import { State } from 'ts-fsrs'
import type { CardRow, Chunk, Settings, Song, Word } from '../db/types'
import { MAX_OPEN_SONGS } from './ingest'

/** Modalità intensiva (spec §3): fino a 25 card nuove al giorno per 7 giorni. */
export const INTENSIVE = { newPerDay: 25, days: 7 }
const DAY = 86_400_000

export function effectiveNewPerDay(settings: Settings, now: Date): number {
  return settings.intensiveUntil && settings.intensiveUntil > now ? INTENSIVE.newPerDay : settings.newPerDay
}

export interface Readiness {
  ready: boolean
  /** Canzoni in corso con voci non ancora entrate nel ripasso (card Riconosci mai vista). */
  notInReview: { title: string; chunks: number; words: number }[]
  loadMinutesPerDay: number
  loadOk: boolean
  openSongs: number
}

/** Prima di aggiungere una canzone: le voci di quelle in corso sono nel ripasso, il carico regge, c'è posto. */
export function readiness(
  d: { settings: Settings; songs: Song[]; chunks: Chunk[]; words: Word[]; cards: CardRow[]; avgSeconds: number },
  now: Date,
): Readiness {
  const rState = new Map(d.cards.filter((c) => c.kind === 'R').map((c) => [c.itemId, c.fsrs.state]))
  const waiting = (i: Chunk | Word) => !i.suspended && rState.get(i.id) === State.New
  const notInReview = d.songs
    .filter((s) => s.status === 'studying' || s.status === 'analyzed')
    .map((s) => ({
      title: s.title,
      chunks: d.chunks.filter((c) => c.songId === s.id && waiting(c)).length,
      words: d.words.filter((w) => w.songId === s.id && w.triage === 'learn' && waiting(w)).length,
    }))
    .filter((x) => x.chunks + x.words > 0)
  const live = new Set([...d.chunks, ...d.words].filter((i) => !i.suspended).map((i) => i.id))
  const due7 = d.cards.filter((c) => c.unlocked === 1 && c.fsrs.state !== State.New && live.has(c.itemId) && c.due.getTime() < now.getTime() + 7 * DAY).length
  const loadMinutesPerDay = (due7 * d.avgSeconds) / 60 / 7
  const loadOk = loadMinutesPerDay <= d.settings.timerMinutes.review
  const openSongs = d.songs.filter((s) => s.status !== 'done').length
  return { ready: notInReview.length === 0 && loadOk && openSongs < MAX_OPEN_SONGS, notInReview, loadMinutesPerDay, loadOk, openSongs }
}
