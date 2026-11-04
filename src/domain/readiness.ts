import { State } from 'ts-fsrs'
import type { CardRow, Chunk, Settings, Song, Word } from '../db/types'
import { MAX_OPEN_SONGS } from './ingest'

/** Modalità intensiva (spec §3): fino a 25 card nuove al giorno per 7 giorni. */
export const INTENSIVE = { newPerDay: 25, days: 7 }
const DAY = 86_400_000

export function effectiveNewPerDay(settings: Settings, now: Date): number {
  // L'intensiva alza le nuove a 25, non le abbassa a chi ne ha scelte di più.
  return settings.intensiveUntil && settings.intensiveUntil > now ? Math.max(INTENSIVE.newPerDay, settings.newPerDay) : settings.newPerDay
}

export interface Readiness {
  ready: boolean
  /** Canzoni in corso con voci non ancora entrate nel ripasso (card Riconosci mai vista), e canzoni (anche completate) con parole mai smistate. */
  notInReview: { title: string; chunks: number; words: number; toTriage: number }[]
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
    // Le completate contano solo per le parole mai smistate (Oggi le nomina): le loro voci non bloccano più.
    .filter((s) => s.status === 'studying' || s.status === 'analyzed' || s.status === 'done')
    .map((s) => {
      const open = s.status !== 'done'
      // Le stesse voci che lo Studio e Oggi mostrano per la canzone: con un verso lì, non quelle di Espandi.
      const inSong = (i: Chunk | Word) => i.origin !== 'expand' && i.contexts.some((x) => x.songId === s.id)
      return {
        title: s.title,
        chunks: open ? d.chunks.filter((c) => inSong(c) && waiting(c)).length : 0,
        words: open ? d.words.filter((w) => inSong(w) && w.triage === 'learn' && waiting(w)).length : 0,
        // Parole mai smistate: Oggi e lo Studio le nominano, quindi anche lo sblocco le conta.
        toTriage: d.words.filter((w) => inSong(w) && w.triage === 'pending' && !w.suspended).length,
      }
    })
    .filter((x) => x.chunks + x.words + x.toTriage > 0)
  const live = new Set([...d.chunks, ...d.words].filter((i) => !i.suspended).map((i) => i.id))
  const due7 = dueItemsWithin(d.cards, live, now, 7)
  const loadMinutesPerDay = (due7 * d.avgSeconds) / 60 / 7
  const loadOk = loadMinutesPerDay <= d.settings.timerMinutes.review
  const openSongs = d.songs.filter((s) => s.status !== 'done').length
  return { ready: notInReview.length === 0 && loadOk && openSongs < MAX_OPEN_SONGS, notInReview, loadMinutesPerDay, loadOk, openSongs }
}

/** Voci (non card) in scadenza entro `days` giorni: la sessione fa vedere una card per voce. */
export function dueItemsWithin(cards: CardRow[], live: Set<string>, now: Date, days: number): number {
  const horizon = now.getTime() + days * DAY
  return new Set(cards.filter((c) => c.unlocked === 1 && c.fsrs.state !== State.New && live.has(c.itemId) && c.due.getTime() < horizon).map((c) => c.itemId)).size
}
