export function parseSpotifyTrackUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.hostname !== 'open.spotify.com') return null
  const m = /^\/(?:intl-[A-Za-z-]+\/)?track\/([A-Za-z0-9]+)\/?$/.exec(u.pathname)
  return m ? `https://open.spotify.com/track/${m[1]}` : null
}

const COVER_HOST = /^(?:i\.scdn\.co|mosaic\.scdn\.co|[a-z0-9-]+\.spotifycdn\.com)$/

/** Accepts only https covers served by Spotify's CDNs; anything else is null. */
export function safeCoverUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    const ok =
      u.protocol === 'https:' &&
      COVER_HOST.test(u.hostname) &&
      u.port === '' &&
      u.username === '' &&
      u.password === ''
    return ok ? u.href : null
  } catch {
    return null
  }
}

export async function fetchTrackInfo(
  trackUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ title: string | null; thumbnailUrl: string | null } | null> {
  try {
    const res = await fetchFn(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown }
    return {
      title: typeof data.title === 'string' && data.title.trim() ? data.title : null,
      thumbnailUrl: safeCoverUrl(data.thumbnail_url),
    }
  } catch {
    return null
  }
}

export async function fetchTrackTitle(
  trackUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  return (await fetchTrackInfo(trackUrl, fetchFn))?.title ?? null
}
