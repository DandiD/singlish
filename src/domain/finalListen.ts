import type { SinglishDB } from '../db/db'
import type { Song } from '../db/types'

/** Il riascolto finale si propone dopo questi giorni di studio (spec §2.6). */
export const FINAL_LISTEN_DAYS = 7
const DAY = 86_400_000

const studyStart = (s: Song) => s.studyStartedAt ?? s.analyzedAt ?? s.addedAt

/** Canzoni in studio da almeno 7 giorni e non ancora riascoltate, dalla più vecchia. */
export function finalListenDue(songs: Song[], now: Date): Song[] {
  return songs
    .filter((s) => s.kind !== 'text' && s.status === 'studying' && s.comprehensionAfter == null)
    .filter((s) => now.getTime() - studyStart(s).getTime() >= FINAL_LISTEN_DAYS * DAY)
    .sort((a, b) => studyStart(a).getTime() - studyStart(b).getTime())
}

/** Una canzone analizzata passa in studio; la data si segna la prima volta. */
export async function startStudying(db: SinglishDB, songId: string, now: Date): Promise<void> {
  await db.songs.where('id').equals(songId).filter((s) => s.status === 'analyzed').modify((s) => {
    s.status = 'studying'
    s.studyStartedAt ??= now
  })
}

/** Registra la comprensione dopo lo studio e completa la canzone. */
export async function saveFinalListen(db: SinglishDB, songId: string, pct: number, now: Date): Promise<void> {
  // Solo una canzone in studio: una già completata non si riscrive (il guadagno resta quello del primo riascolto),
  // una bozza o una «Da studiare» non si chiude prima di averla studiata.
  await db.songs.where('id').equals(songId).filter((s) => s.status === 'studying' && s.kind !== 'text').modify({ comprehensionAfter: pct, finalListenAt: now, status: 'done' })
}

/** Punti guadagnati in media fra primo ascolto e riascolto finale; null se nessuna canzone ha entrambi. */
export function averageGain(songs: Song[]): number | null {
  const both = songs.filter((s) => s.comprehensionBefore != null && s.comprehensionAfter != null)
  if (both.length === 0) return null
  return Math.round(both.reduce((t, s) => t + (s.comprehensionAfter! - s.comprehensionBefore!), 0) / both.length)
}
