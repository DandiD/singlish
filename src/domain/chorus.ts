export const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, '').replace(/\s+/g, ' ').trim()

/** Il ritornello: le righe che compaiono almeno due volte, nell'ordine della prima volta (al massimo sei). */
export function chorusLines(lines: string[]): string[] {
  const count = new Map<string, number>()
  for (const l of lines) { const k = norm(l); if (k) count.set(k, (count.get(k) ?? 0) + 1) }
  const out: string[] = []
  const seen = new Set<string>()
  for (const l of lines) {
    const k = norm(l)
    if ((count.get(k) ?? 0) >= 2 && !seen.has(k)) { seen.add(k); out.push(l) }
  }
  return out.slice(0, 6)
}

/** Le forme normalizzate delle righe del ritornello (le stesse di `chorusLines`). */
export function chorusKeys(lines: string[]): Set<string> {
  return new Set(chorusLines(lines).map(norm))
}

/** Vero se la riga appartiene al ritornello del testo. */
export function isChorusLine(lines: string[], line: string): boolean {
  return chorusKeys(lines).has(norm(line))
}
