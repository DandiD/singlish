/** Le parole di un verso, con la posizione nel verso (apostrofi e trattini fanno parte della parola). */
export function tokenize(line: string): { text: string; start: number; end: number }[] {
  return [...line.matchAll(/[A-Za-z0-9’'-]+/g)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }))
}

/**
 * Ciò che lo studente ha segnato. Parola e giunto hanno chiave `riga:parola`; il giunto `l:t`
 * unisce la parola `t` con la `t+1`. `verses` sono le righe da spiegare per intero.
 */
export type Selection = { words: ReadonlySet<string>; joins: ReadonlySet<string>; verses: ReadonlySet<number> }

/** Una voce da chiedere: `text` c'è solo per parole ed espressioni (`w*`), non per i versi interi (`v*`). */
export type AskRequest = { id: string; lineIndex: number; text?: string }

export const MAX_REQUESTS = 12

export const emptySelection = (): Selection => ({ words: new Set(), joins: new Set(), verses: new Set() })

const parse = (key: string): [number, number] => {
  const [l, t] = key.split(':')
  return [Number(l), Number(t)]
}

const flip = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

/** Prima tutte le parole/espressioni in ordine di testo, poi i versi interi in ordine di riga. */
export function requestsOf(lines: string[], sel: Selection): AskRequest[] {
  const requests: AskRequest[] = []
  lines.forEach((line, li) => {
    const toks = tokenize(line)
    let run: number[] = []
    const flush = () => {
      if (run.length) requests.push({ id: `w${requests.length + 1}`, lineIndex: li, text: line.slice(toks[run[0]].start, toks[run[run.length - 1]].end) })
      run = []
    }
    toks.forEach((_, ti) => {
      if (!sel.words.has(`${li}:${ti}`)) return flush()
      // Una parola segnata continua l'espressione solo se il giunto con la precedente c'è.
      if (run.length && !sel.joins.has(`${li}:${ti - 1}`)) flush()
      run.push(ti)
    })
    flush()
  })
  const verses = [...sel.verses].sort((a, b) => a - b)
  verses.forEach((lineIndex, i) => requests.push({ id: `v${i + 1}`, lineIndex }))
  return requests
}

/** Segna o toglie una parola; togliendola cadono anche i giunti che la toccano. */
export function toggleWord(sel: Selection, key: string): Selection {
  const words = flip(sel.words, key)
  if (words.has(key)) return { ...sel, words }
  const [l, t] = parse(key)
  const joins = new Set(sel.joins)
  joins.delete(`${l}:${t - 1}`)
  joins.delete(`${l}:${t}`)
  return { ...sel, words, joins }
}

/** Unisce o separa due parole vicine; vale solo se sono entrambe segnate. */
export function toggleJoin(sel: Selection, key: string): Selection {
  const [l, t] = parse(key)
  if (!sel.words.has(`${l}:${t}`) || !sel.words.has(`${l}:${t + 1}`)) return sel
  return { ...sel, joins: flip(sel.joins, key) }
}

export function toggleVerse(sel: Selection, lineIndex: number): Selection {
  return { ...sel, verses: flip(sel.verses, lineIndex) }
}

/** Si può sempre togliere; si può aggiungere finché le voci non superano il massimo. */
export function withinLimit(lines: string[], before: Selection, after: Selection): boolean {
  const n = requestsOf(lines, after).length
  return n <= MAX_REQUESTS || n <= requestsOf(lines, before).length
}
