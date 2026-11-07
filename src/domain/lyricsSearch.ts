/** Ricerca Google del testo: l'app non scarica testi, apre la ricerca e l'utente incolla. */
export function lyricsSearchUrl(title: string, artist: string): string | null {
  const q = [title.trim(), artist.trim()].filter(Boolean).join(' ')
  if (!q) return null
  return `https://www.google.com/search?${new URLSearchParams({ q: `${q} lyrics` })}`
}
