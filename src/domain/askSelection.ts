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

/**
 * Il trascinamento sul verso `l` dalla parola `from` alla `to` (in un senso o nell'altro): le parole in mezzo
 * diventano un'unica espressione, che assorbe quelle già segnate e resta separata dalle vicine.
 */
export function selectRange(sel: Selection, l: number, from: number, to: number): Selection {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const words = new Set(sel.words)
  const joins = new Set(sel.joins)
  joins.delete(`${l}:${a - 1}`)
  for (let t = a; t <= b; t++) {
    words.add(`${l}:${t}`)
    if (t < b) joins.add(`${l}:${t}`)
    else joins.delete(`${l}:${t}`)
  }
  return { ...sel, words, joins }
}

export function toggleVerse(sel: Selection, lineIndex: number): Selection {
  return { ...sel, verses: flip(sel.verses, lineIndex) }
}

/** Si può sempre togliere; si può aggiungere finché le voci non superano il massimo. */
export function withinLimit(lines: string[], before: Selection, after: Selection): boolean {
  const n = requestsOf(lines, after).length
  return n <= MAX_REQUESTS || n <= requestsOf(lines, before).length
}
