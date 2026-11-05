import type { SinglishDB } from '../db/db'
import type { Song } from '../db/types'
import { pendingProductions } from './production'
import { startOfLocalDay } from './queue'

/** Card fatte oggi: ripassi registrati da mezzanotte locale + frasi scritte oggi ancora da correggere. */
export async function doneToday(db: SinglishDB, now: Date): Promise<number> {
  const start = startOfLocalDay(now)
  const reviews = await db.reviews.where('reviewedAt').aboveOrEqual(start).count()
  const written = (await pendingProductions(db)).filter((p) => p.at !== undefined && p.at >= start).length
  return reviews + written
}

export type RingState = 'todo' | 'partial' | 'done' | 'empty'

export function dayRing(input: { done: number; left: number; blocked: boolean }): { done: number; total: number; state: RingState; blocked: boolean } {
  const { done, left, blocked } = input
  const state: RingState = left > 0 ? (done === 0 ? 'todo' : 'partial') : done > 0 ? 'done' : 'empty'
  return { done, total: done + left, state, blocked }
}

export type Invite =
  | { kind: 'correct'; count: number }
  | { kind: 'final'; song: Song }
  | { kind: 'triage'; song: Song; count: number }
  | { kind: 'study'; song: Song }

export function featuredInvite(input: { toCorrect: number; finalDue: Song[]; toTriage: { song: Song; count: number }[]; toStudy: Song[] }): Invite | null {
  if (input.toCorrect > 0) return { kind: 'correct', count: input.toCorrect }
  if (input.finalDue[0]) return { kind: 'final', song: input.finalDue[0] }
  const t = input.toTriage.find((x) => x.count > 0)
  if (t) return { kind: 'triage', song: t.song, count: t.count }
  if (input.toStudy[0]) return { kind: 'study', song: input.toStudy[0] }
  return null
}

/**
 * La canzone del giorno, in testa a Oggi: quella con più card nella coda di oggi (a pari card, l'aggiunta prima);
 * se no quella dell'invito in evidenza; se no la canzone in studio aperta più di recente; se no nessuna.
 * `queueSongIds` è la canzone di ogni card in coda (id fuori da `songs` non contano).
 */
export function todaySong(input: { queueSongIds: string[]; invite: Invite | null; songs: Song[] }): Song | null {
  const { queueSongIds, invite, songs } = input
  const counts = new Map<string, number>()
  for (const id of queueSongIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  let best: Song | null = null
  for (const song of songs) {
    const n = counts.get(song.id) ?? 0
    if (n === 0) continue
    const b = best ? counts.get(best.id)! : 0
    if (!best || n > b || (n === b && song.addedAt.getTime() < best.addedAt.getTime())) best = song
  }
  if (best) return best
  if (invite && invite.kind !== 'correct') return invite.song
  const studiedAt = (s: Song) => (s.studyStartedAt ?? s.analyzedAt ?? s.addedAt).getTime()
  let recent: Song | null = null
  for (const song of songs) {
    if (song.status === 'studying' && (!recent || studiedAt(song) > studiedAt(recent))) recent = song
  }
  return recent
}

export type EmptyAction =
  | { kind: 'add' }
  | { kind: 'correct'; count: number }
  | { kind: 'triage'; song: Song; count: number }
  | { kind: 'study'; song: Song }
  | { kind: 'analyze'; song: Song }
  | { kind: 'none' }

export function emptyAction(input: { hasSongs: boolean; toCorrect: number; toTriage: { song: Song; count: number }[]; toStudy: Song[]; toAnalyze: Song[] }): EmptyAction {
  if (!input.hasSongs) return { kind: 'add' }
  if (input.toCorrect > 0) return { kind: 'correct', count: input.toCorrect }
  const t = input.toTriage.find((x) => x.count > 0)
  if (t) return { kind: 'triage', song: t.song, count: t.count }
  if (input.toStudy[0]) return { kind: 'study', song: input.toStudy[0] }
  if (input.toAnalyze[0]) return { kind: 'analyze', song: input.toAnalyze[0] }
  return { kind: 'none' }
}
