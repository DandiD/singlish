import { highlightLine, type Span } from '../../domain/songItems'
export { formIn, highlightLine, type Span, type Segment } from '../../domain/songItems'

export function Highlighted({
  line,
  spans,
  hrefFor,
  onPick,
  openId,
}: {
  line: string
  spans: Span[]
  hrefFor?: (id: string) => string | undefined
  /** Le voci diventano pulsanti: il tocco passa l'id (e non arriva agli elementi sotto). */
  onPick?: (id: string) => void
  /** Con `onPick`: la voce aperta (`aria-expanded`). */
  openId?: string | null
}) {
  return (
    <>
      {highlightLine(line, spans).map((seg, i) => {
        if (!('id' in seg)) return <>{seg.text}</>
        if (onPick) {
          // Uno span e non un <button>: una voce lunga deve poter andare a capo come il resto del verso.
          const id = seg.id
          const pick = (e: Event) => { e.stopPropagation(); onPick(id) }
          return (
            <span key={i} class={`hl ${seg.className}`} role="button" tabIndex={0} aria-expanded={openId === id}
              onClick={pick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e) } }}>{seg.text}</span>
          )
        }
        const to = hrefFor?.(seg.id)
        return to ? (
          <a key={i} class={`hl ${seg.className}`} href={to}>{seg.text}</a>
        ) : (
          <span key={i} class={`hl ${seg.className}`}>{seg.text}</span>
        )
      })}
    </>
  )
}
