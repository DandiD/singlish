const CONTRACTIONS: Array<[string, string]> = [
  ["i'm", 'i am'],
  ["you're", 'you are'],
  ["it's", 'it is'],
  ["don't", 'do not'],
  ["can't", 'cannot'],
  ["won't", 'will not'],
  ['gonna', 'going to'],
  ['wanna', 'want to'],
]

const fixQuotes = (s: string): string => s.replace(/[’‘]/g, "'")
const squeeze = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function splitLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => squeeze(fixQuotes(l)))
    .filter((l) => l !== '' && !/^\[[^\]]*\]$/.test(l))
}

export function normalizeAnswer(s: string): string {
  let out = squeeze(fixQuotes(s.toLowerCase()))
  for (const [from, to] of CONTRACTIONS) {
    out = out.replace(new RegExp(`(?<![\\w'])${from}(?![\\w'])`, 'g'), to)
  }
  return out
}

export const normalizeKey = normalizeAnswer

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

export function gradeAnswer(given: string, expected: string): { rating: 1 | 2 | 3; distance: number } {
  // Spec §5 sulle forme normalizzate; in più, una contrazione scritta senza apostrofo («dont») resta un errore
  // di battitura: si confrontano anche le forme senza espansione e vale la distanza minore.
  const plain = (s: string) => squeeze(fixQuotes(s.toLowerCase()))
  const distance = Math.min(
    levenshtein(normalizeAnswer(given), normalizeAnswer(expected)),
    levenshtein(plain(given), plain(expected)),
  )
  return { rating: distance === 0 ? 3 : distance === 1 ? 2 : 1, distance }
}

/** Le parole di una frase normalizzata (spec §5), senza punteggiatura. */
const words = (s: string): string[] => normalizeAnswer(s).replace(/[^a-z0-9' ]+/g, ' ').split(' ').filter(Boolean)

/** Distanza fra due elenchi di parole (Levenshtein a parole). */
function wordDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/** Dettato della card Ascolta: tutte le parole giuste = Bene, una sbagliata o mancante = Difficile, di più = Di nuovo. */
export function gradeDictation(given: string, expected: string): { rating: 1 | 2 | 3; wrongWords: number } {
  // Come per le risposte: si confrontano anche le parole senza apostrofi né contrazioni espanse («im» = «I'm»).
  const plain = (s: string) => squeeze(fixQuotes(s.toLowerCase())).replace(/'/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean)
  const wrongWords = Math.min(wordDistance(words(given), words(expected)), wordDistance(plain(given), plain(expected)))
  return { rating: wrongWords === 0 ? 3 : wrongWords === 1 ? 2 : 1, wrongWords }
}

/**
 * La parte di `expected` che differisce da `given`, trovata con prefisso e suffisso comuni (senza maiuscole).
 * Le parti sono fette di `expected` (before + diff + after === expected). `null` se uguali.
 * Il suffisso non si sovrappone al prefisso, così con lettere ripetute la parte è la minima.
 * `diff` non è mai vuoto: se `given` ha solo lettere in più (inserimento), si prende la lettera di `expected`
 * subito prima del punto dell'inserimento (o la prima, se l'inserimento è in testa).
 */
export function typoSpan(given: string, expected: string): { before: string; diff: string; after: string } | null {
  const g = given.toLowerCase()
  const e = expected.toLowerCase()
  if (g === e) return null
  const max = Math.min(g.length, e.length)
  let p = 0
  while (p < max && g[p] === e[p]) p++
  let s = 0
  while (s < max - p && g[g.length - 1 - s] === e[e.length - 1 - s]) s++
  let start = p
  let end = e.length - s
  if (start === end && e.length > 0) {
    if (start > 0) start -= 1
    else end = 1
  }
  return { before: expected.slice(0, start), diff: expected.slice(start, end), after: expected.slice(end) }
}
