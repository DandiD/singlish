import { highlightLine, type Span } from '../../domain/songItems'
export { formIn, highlightLine, type Span, type Segment } from '../../domain/songItems'

export function Highlighted({
  line,
  spans,
  hrefFor,
}: {
  line: string
  spans: Span[]
  hrefFor?: (id: string) => string | undefined
}) {
  return (
    <>
      {highlightLine(line, spans).map((seg, i) => {
        if (!('id' in seg)) return <>{seg.text}</>
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
