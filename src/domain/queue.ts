import { State } from 'ts-fsrs'
import type { SinglishDB } from '../db/db'
import type { CardRow, SessionRow } from '../db/types'
import { getSettings } from './settings'
import { effectiveNewPerDay } from './readiness'
import { pendingProductions } from './production'

export const DEFAULT_SECONDS_PER_REVIEW = 12
const AVG_WINDOW = 200
const AVG_MIN_SAMPLES = 50

export type QueueItem = { card: CardRow; isNew: boolean }

/** Local midnight of the day after the one containing `now` (DST-safe: local constructor, not +24h). */
export function startOfNextLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
}

/** Local midnight of the day containing `now` (DST-safe). */
export function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function estimateAvgSeconds(db: SinglishDB): Promise<number> {
  const last = await db.reviews.orderBy('reviewedAt').reverse().limit(AVG_WINDOW).toArray()
  if (last.length < AVG_MIN_SAMPLES) return DEFAULT_SECONDS_PER_REVIEW
  const totalMs = last.reduce((sum, r) => sum + r.elapsedMs, 0)
  return totalMs / last.length / 1000
}

export async function buildSessionQueue(
  db: SinglishDB,
  now: Date,
): Promise<{
  items: QueueItem[]
  dueCount: number
  newCount: number
  estMinutes: number
  newBlockedByLoad: boolean
  /** La sessione di ripasso di oggi lasciata a metà, se c'è. */
  openSession: SessionRow | null
}> {
  const settings = await getSettings(db)
  const avgSeconds = await estimateAvgSeconds(db)

  const [chunks, words, songs, unlocked] = await Promise.all([
    db.chunks.toArray(),
    db.words.toArray(),
    db.songs.toArray(),
    db.cards
      .where('[unlocked+due]')
      .between([1, new Date(0)], [1, startOfNextLocalDay(now)], true, false)
      .toArray(),
  ])
  const chunkById = new Map(chunks.map((c) => [c.id, c]))
  const wordById = new Map(words.map((w) => [w.id, w]))
  const songAdded = new Map(songs.map((s) => [s.id, s.addedAt.getTime()]))
  const songKind = new Map(songs.map((s) => [s.id, s.kind]))

  const itemOf = (c: CardRow) => (c.itemType === 'chunk' ? chunkById.get(c.itemId) : wordById.get(c.itemId))
  const active = (c: CardRow) => {
    const item = itemOf(c)
    return !!item && !item.suspended
  }

  // In una sessione lasciata a metà ciò che è già stato ripassato non torna (spec §4: stessa voce mai due
  // volte nella stessa sessione), anche se FSRS la rimette in scadenza oggi. Oggi e Sessione contano così,
  // e il carico che blocca le nuove è quello che resta davvero.
  const openSession = await findOpenReviewSession(db, now)
  const seen = new Set<string>()
  // Una voce con una frase ancora da correggere (card Produci) aspetta la correzione: non torna in coda.
  for (const s of await db.sessions.toArray()) for (const p of s.productions ?? []) seen.add(p.itemId)
  if (openSession) {
    const reviewed = await db.reviews.where('reviewedAt').aboveOrEqual(openSession.startedAt).toArray()
    for (const c of await db.cards.bulkGet(reviewed.map((r) => r.cardId))) if (c) seen.add(c.itemId)
  }
  // Le nuove arrivano solo dalle canzoni che si stanno studiando (o già completate):
  // una canzone analizzata e «tenuta per più avanti» non porta card nuove finché non si apre lo Studio.
  const songStatus = new Map(songs.map((s) => [s.id, s.status]))
  const studied = (songId: string) => {
    const st = songStatus.get(songId)
    return st === 'studying' || st === 'done'
  }
  const inStudy = (c: CardRow) => {
    const item = itemOf(c)!
    // Una voce di Espandi non ha versi: segue la parola da cui è nata.
    const anchor = item.fromItemId ? wordById.get(item.fromItemId) ?? item : item
    return studied(anchor.songId) || anchor.contexts.some((x) => studied(x.songId))
  }
  const items: QueueItem[] = []

  const dueCards = unlocked
    .filter((c) => c.fsrs.state !== State.New && active(c))
    .sort((a, b) => a.due.getTime() - b.due.getTime())
  for (const card of dueCards) {
    if (seen.has(card.itemId)) continue
    seen.add(card.itemId)
    items.push({ card, isNew: false })
  }
  const dueCount = items.length

  const doneToday = await db.reviews
    .where('reviewedAt')
    .between(startOfLocalDay(now), now, true, true)
    .filter((r) => r.wasNew)
    .count()
  // Anche le frasi scritte oggi su card Produci nuove, ancora da correggere, hanno usato una nuova di oggi.
  const dayStart = startOfLocalDay(now).getTime()
  const writtenNewToday = (await pendingProductions(db)) // solo frasi con la card ancora presente e il chunk attivo
    .filter((p) => p.wasNew && p.at && p.at.getTime() >= dayStart && p.at <= now).length
  let budget = Math.max(0, effectiveNewPerDay(settings, now) - doneToday - writtenNewToday)
  const newBlockedByLoad = (dueCount * avgSeconds) / 60 > settings.timerMinutes.review
  if (newBlockedByLoad) budget = 0

  if (budget > 0) {
    const sortKey = (c: CardRow) => {
      const item = itemOf(c)!
      return {
        // Priorità (spec §2): chunk delle canzoni, parole da imparare, espansioni e sfumature, poi testi liberi.
        group: songKind.get(item.songId) === 'text' ? 3 : item.origin === 'expand' || c.kind === 'S' ? 2 : c.itemType === 'chunk' ? 0 : 1,
        added: songAdded.get(item.songId) ?? 0,
        line: item.lineIndex,
        kind: c.kind === 'R' ? 0 : 1,
      }
    }
    const candidates = (
      await db.cards.where('[unlocked+due]').between([1, new Date(0)], [1, new Date(8.64e15)]).toArray()
    )
      .filter((c) => {
        if (c.fsrs.state !== State.New || !active(c) || !inStudy(c)) return false
        return c.itemType === 'chunk' || wordById.get(c.itemId)?.triage === 'learn'
      })
      .map((c) => ({ c, k: sortKey(c) }))
      .sort((x, y) => x.k.group - y.k.group || x.k.added - y.k.added || x.k.line - y.k.line || x.k.kind - y.k.kind)
    for (const { c } of candidates) {
      if (items.length - dueCount >= budget) break
      if (seen.has(c.itemId)) continue
      seen.add(c.itemId)
      items.push({ card: c, isNew: true })
    }
  }

  return {
    items,
    dueCount,
    newCount: items.length - dueCount,
    estMinutes: Math.ceil((items.length * avgSeconds) / 60),
    newBlockedByLoad,
    openSession,
  }
}

/** L'ultima sessione di ripasso iniziata oggi e non chiusa. */
export async function findOpenReviewSession(db: SinglishDB, now: Date): Promise<SessionRow | null> {
  const open = (await db.sessions.where('startedAt').aboveOrEqual(startOfLocalDay(now)).toArray())
    .filter((r) => r.kind === 'review' && r.endedAt === null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  return open[0] ?? null
}
