export type Motif = 'waves' | 'circles' | 'lines'

const MOTIFS: Motif[] = ['waves', 'circles', 'lines']
const PLACEHOLDER_TITLE = 'senza titolo'

/** FNV-1a a 32 bit. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Tinta (1-6) e motivo della copertina generata: stabili per lo stesso id. */
export function songLook(id: string): { hue: 1 | 2 | 3 | 4 | 5 | 6; motif: Motif } {
  const h = hash(id)
  return {
    hue: ((h % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    motif: MOTIFS[Math.floor(h / 6) % 3],
  }
}

/** Una o due iniziali maiuscole del titolo, oppure «♪» se non ci sono lettere. */
export function coverInitials(title: string): string {
  const trimmed = title.trim()
  if (trimmed.toLocaleLowerCase('it') === PLACEHOLDER_TITLE) return '♪'
  const letters: string[] = []
  for (const word of trimmed.split(/\s+/)) {
    const first = word.match(/\p{L}/u)?.[0]
    if (first) letters.push(first)
    if (letters.length === 2) break
  }
  return letters.length ? letters.join('').toLocaleUpperCase('it') : '♪'
}
