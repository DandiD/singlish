export function ranksFromList(lemmas: string[]): Map<string, number> {
  const ranks = new Map<string, number>()
  lemmas.forEach((lemma, i) => {
    const key = lemma.toLowerCase()
    if (!ranks.has(key)) ranks.set(key, i + 1)
  })
  return ranks
}

let cache: Map<string, number> | null = null
let listCache: string[] | null = null

export function resetRanksCache(): void {
  cache = null
  listCache = null
}

/** La lista di frequenza (lemmi in ordine di rango). */
export async function loadFreqList(fetchFn: typeof fetch = fetch): Promise<string[]> {
  if (listCache) return listCache
  const res = await fetchFn(import.meta.env.BASE_URL + 'freq.json')
  if (!res.ok) throw new Error(`freq.json: HTTP ${res.status}`)
  listCache = (await res.json()) as string[]
  return listCache
}

export async function loadRanks(fetchFn: typeof fetch = fetch): Promise<Map<string, number>> {
  if (cache) return cache
  cache = ranksFromList(await loadFreqList(fetchFn))
  return cache
}

export function filterWordsByBand<T extends { lemma: string }>(
  words: T[],
  ranks: Map<string, number>,
  band: [number, number],
  known: Set<string>,
): (T & { freqRank: number })[] {
  const out: (T & { freqRank: number })[] = []
  for (const w of words) {
    const key = w.lemma.toLowerCase()
    const rank = ranks.get(key)
    if (rank === undefined || rank < band[0] || rank > band[1] || known.has(key)) continue
    out.push({ ...w, freqRank: rank })
  }
  return out
}
