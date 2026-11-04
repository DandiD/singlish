/**
 * Test di vocabolario sì/no: parole vere della lista di frequenza, per fasce di rango, e parole inventate.
 * La quota di «la conosco» per fascia si corregge con i sì alle parole inventate; la stima è la somma sulle fasce.
 */
export const BANDS = [
  { from: 1, to: 1000 },
  { from: 1001, to: 2000 },
  { from: 2001, to: 4000 },
  { from: 4001, to: 8000 },
  { from: 8001, to: 12000 },
  { from: 12001, to: 20000 },
] as const
const PER_BAND = 10
const FAKES = 20

/** Parole inventate, dall'aspetto inglese: chi dice di conoscerle sta tirando a indovinare. */
export const PSEUDOWORDS = [
  'flurple', 'tarmish', 'glenter', 'snorkid', 'brontle', 'quimber', 'vastrel', 'plinder', 'crobble', 'fendrous',
  'gristam', 'haltric', 'joffle', 'morrent', 'nusket', 'pelvane', 'quastle', 'rindow', 'slombert', 'trezzle',
  'umbrock', 'vintrel', 'wistram', 'yarnick', 'zelbourne', 'clumbish', 'drevance', 'fostile', 'glimber', 'harrowsome',
]

export type VocabItem = { word: string; fake: boolean; rank?: number }

function pick<T>(arr: T[], n: number, rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

/** Le fasce che la lista di frequenza copre per intero (la lista del progetto può essere ancora parziale). */
const coveredBands = (freq: string[]) => BANDS.filter((b) => b.to <= freq.length)

/** Servono almeno tre fasce coperte perché la stima abbia senso. */
export function vocabTestAvailable(freq: string[]): boolean {
  return coveredBands(freq).length >= 3
}

export function buildVocabTest(freq: string[], rng: () => number): VocabItem[] {
  const real = coveredBands(freq).flatMap((b) => {
    const ranks = Array.from({ length: Math.min(b.to, freq.length) - b.from + 1 }, (_, i) => b.from + i)
    return pick(ranks, PER_BAND, rng).map((rank) => ({ word: freq[rank - 1], fake: false, rank }))
  })
  const fakes = pick(PSEUDOWORDS, FAKES, rng).map((word) => ({ word, fake: true }))
  return pick([...real, ...fakes], real.length + fakes.length, rng)
}

export interface VocabResult {
  estimate: number
  falseAlarms: number
  bands: { from: number; to: number; known: number; total: number }[]
}

export function scoreVocabTest(items: VocabItem[], answers: boolean[]): VocabResult {
  const fakes = items.filter((i) => i.fake)
  const falseAlarms = items.filter((i, k) => i.fake && answers[k]).length
  const fa = fakes.length ? falseAlarms / fakes.length : 0
  const bands = BANDS.filter((b) => items.some((it) => !it.fake && it.rank! >= b.from && it.rank! <= b.to)).map((b) => {
    const inBand = items.map((it, k) => ({ it, yes: answers[k] })).filter(({ it }) => !it.fake && it.rank! >= b.from && it.rank! <= b.to)
    return { from: b.from, to: b.to, known: inBand.filter((x) => x.yes).length, total: inBand.length }
  })
  const estimate = bands.reduce((sum, b) => {
    const hit = b.total ? b.known / b.total : 0
    const corrected = fa >= 1 ? 0 : Math.max(0, (hit - fa) / (1 - fa))
    return sum + corrected * (b.to - b.from + 1)
  }, 0)
  return { estimate: Math.round(estimate / 100) * 100, falseAlarms, bands }
}

/** Fascia utile suggerita dalla stima: da lì in su, per 5.000 ranghi. */
export function suggestedBand(estimate: number): [number, number] {
  const start = Math.max(1000, Math.floor(estimate / 1000) * 1000)
  return [start, Math.min(20000, start + 5000)]
}
