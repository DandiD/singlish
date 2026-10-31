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

export async function fetchTrackTitle(
  trackUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`)
    if (!res.ok) return null
    const data = (await res.json()) as { title?: unknown }
    return typeof data.title === 'string' && data.title.trim() ? data.title : null
  } catch {
    return null
  }
}
