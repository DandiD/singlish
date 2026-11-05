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
