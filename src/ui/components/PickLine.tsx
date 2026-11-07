import { tokenize, type Selection } from '../../domain/askSelection'

type Props = {
  line: string
  lineIndex: number
  sel: Selection
  onWord(key: string): void
  onJoin(key: string): void
  onVerse(lineIndex: number): void
  disabled?: boolean
}

/**
 * Un verso in modalità selezione: il numero lo chiede intero, ogni parola si segna e si toglie,
 * e fra due parole vicine segnate compare il giunto ↔ che le unisce in un'espressione.
 * Durante la richiesta niente si tocca: ciò che si segnasse adesso non partirebbe.
 */
export function PickLine({ line, lineIndex, sel, onWord, onJoin, onVerse, disabled }: Props) {
  const toks = tokenize(line)
  const out: preact.ComponentChildren[] = []
  let pos = 0
  toks.forEach((t, ti) => {
    const gap = line.slice(pos, t.start)
    const prev = toks[ti - 1]
    const joinKey = `${lineIndex}:${ti - 1}`
    const jointHere = prev && sel.words.has(joinKey) && sel.words.has(`${lineIndex}:${ti}`)
    if (jointHere) {
      const text = gap.trim()
      if (text) out.push(text)
      const joined = sel.joins.has(joinKey)
      out.push(
        <button
          key={`j${joinKey}`}
          type="button"
          class="joint"
          lang="it"
          aria-pressed={joined}
          aria-label={joined ? `Separa «${prev.text}» e «${t.text}»` : `Unisci «${prev.text}» e «${t.text}»`}
          disabled={disabled}
          onClick={() => onJoin(joinKey)}
        >↔</button>,
      )
    } else if (gap) out.push(gap)
    const key = `${lineIndex}:${ti}`
    out.push(
      <button key={key} type="button" class="tok" aria-pressed={sel.words.has(key)} disabled={disabled} onClick={() => onWord(key)}>{t.text}</button>,
    )
    pos = t.end
  })
  if (pos < line.length) out.push(line.slice(pos))
  return (
    <>
      <button
        type="button"
        class="verse-no"
        lang="it"
        aria-pressed={sel.verses.has(lineIndex)}
        aria-label={`Verso intero ${lineIndex + 1}`}
        disabled={disabled}
        onClick={() => onVerse(lineIndex)}
      >{lineIndex + 1}</button>
      {out}
    </>
  )
}
