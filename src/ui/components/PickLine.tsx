import { useEffect, useRef } from 'preact/hooks'
import { tokenize, type Selection } from '../../domain/askSelection'

type Props = {
  line: string
  lineIndex: number
  sel: Selection
  /** Un tocco su una parola; `extend` con Maiusc: estende dalla parola toccata prima. */
  onWord(key: string, extend: boolean): void
  /**
   * Il dito trascinato dalla parola `from` alla `to`: si applica sempre alla selezione di quando è partito.
   * `erase` se è partito da una parola segnata: allora le parole su cui passa si tolgono.
   */
  onRange(base: Selection, from: number, to: number, erase: boolean): void
  onVerse(lineIndex: number): void
  disabled?: boolean
}

/**
 * Un verso in modalità selezione: il numero lo chiede intero, un tocco segna o toglie una parola,
 * il dito trascinato sulle parole vicine segna un'espressione (tornando indietro si accorcia);
 * partito da una parola segnata, invece, le parole su cui passa si tolgono.
 * Le parole di un'espressione stanno in un'unica fascia. Durante la richiesta niente si tocca.
 */
export function PickLine({ line, lineIndex, sel, onWord, onRange, onVerse, disabled }: Props) {
  const toks = tokenize(line)
  const drag = useRef<{ base: Selection; from: number; to: number; erase: boolean } | null>(null)
  // Dopo un trascinamento il browser può mandare un click sulla parola di partenza: non deve toglierla.
  const quietUntil = useRef(0)
  const range = useRef(onRange)
  range.current = onRange
  const stop = useRef<() => void>(() => {})
  useEffect(() => () => stop.current(), [])

  const start = (e: PointerEvent, ti: number) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    stop.current()
    drag.current = { base: sel, from: ti, to: ti, erase: sel.words.has(`${lineIndex}:${ti}`) }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-tok]')
      if (!d || !el) return
      const [l, t] = el.dataset.tok!.split(':').map(Number)
      // Un'espressione sta su un solo verso: sugli altri il dito non la estende.
      if (l !== lineIndex || t === d.to) return
      d.to = t
      quietUntil.current = performance.now() + 500
      range.current(d.base, d.from, t, d.erase)
    }
    const end = () => stop.current()
    stop.current = () => {
      drag.current = null
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      stop.current = () => {}
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
  }

  const button = (ti: number) => {
    const key = `${lineIndex}:${ti}`
    return (
      <button
        key={key}
        type="button"
        class="tok"
        data-tok={key}
        aria-pressed={sel.words.has(key)}
        disabled={disabled}
        onPointerDown={(e) => start(e, ti)}
        onClick={(e) => { if (performance.now() >= quietUntil.current) onWord(key, e.shiftKey) }}
      >{toks[ti].text}</button>
    )
  }

  const out: preact.ComponentChildren[] = []
  let run: preact.ComponentChildren[] = []
  const flush = () => {
    if (run.length > 1) out.push(<span key={`r${out.length}`} class="tok-run">{run}</span>)
    else out.push(...run)
    run = []
  }
  let pos = 0
  toks.forEach((t, ti) => {
    const gap = line.slice(pos, t.start)
    const inRun = sel.words.has(`${lineIndex}:${ti}`) && sel.joins.has(`${lineIndex}:${ti - 1}`)
    if (inRun) run.push(gap)
    else {
      flush()
      if (gap) out.push(gap)
    }
    if (!inRun && !sel.words.has(`${lineIndex}:${ti}`)) out.push(button(ti))
    else run.push(button(ti))
    pos = t.end
  })
  flush()
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
