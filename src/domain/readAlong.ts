import type { SinglishDB } from '../db/db'
import type { Song } from '../db/types'
import { chorusKeys, norm } from './chorus'

export type ReadLine = { lineIndex: number; text: string; chorus: boolean }

/** Le righe da leggere: quelle non vuote, nell'ordine; «ritornello» se ripetute (come nella schermata Ritornello). */
export function readingLines(song: Pick<Song, 'lines'>): ReadLine[] {
  const keys = chorusKeys(song.lines)
  const out: ReadLine[] = []
  song.lines.forEach((raw, lineIndex) => {
    const text = raw.trim()
    if (text) out.push({ lineIndex, text, chorus: keys.has(norm(text)) })
  })
  return out
}

/** Segna la lettura finita; solo per canzoni analizzate, in studio o completate. */
export async function saveReadAlong(db: SinglishDB, songId: string, now: Date): Promise<void> {
  await db.songs.where('id').equals(songId)
    .filter((s) => s.status === 'analyzed' || s.status === 'studying' || s.status === 'done')
    .modify({ readAlongAt: now })
}
