import type { SinglishDB } from '../db/db'
import { fetchTrackInfo } from './spotify'

/** Tentativi di questa sessione dell'app (chiave `songId:spotifyUrl`): offline non si riprova a ogni vista. */
const sessionTried = new Set<string>()

export function resetCoverAttempts(): void {
  sessionTried.clear()
}

/**
 * Cerca la copertina di una canzone su Spotify (oEmbed) e la salva. Non lancia per errori di rete;
 * gli errori di IndexedDB si propagano (chi chiama usa `.catch(reportError)`).
 */
export async function ensureCover(
  db: SinglishDB,
  songId: string,
  fetchFn: typeof fetch,
  tried: Set<string> = sessionTried,
): Promise<void> {
  const song = await db.songs.get(songId)
  if (!song || song.kind === 'text' || !song.spotifyUrl || song.coverUrl !== undefined) return
  const url = song.spotifyUrl
  const key = `${songId}:${url}`
  if (tried.has(key)) return
  tried.add(key)
  const info = await fetchTrackInfo(url, fetchFn)
  if (!info) return
  await db.songs.where('id').equals(songId).filter((s) => s.spotifyUrl === url).modify({ coverUrl: info.thumbnailUrl })
}
