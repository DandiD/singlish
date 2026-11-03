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
