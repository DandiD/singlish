export interface Span { text: string; id: string; className: string }
export type Segment = { text: string } | Span

const fold = (s: string): string => s.replace(/[’‘]/g, "'").toLowerCase()

/** Divide la riga in segmenti: testo semplice e span evidenziati (primo match per span, il più lungo vince). */
export function highlightLine(line: string, spans: Span[]): Segment[] {
  const hay = fold(line)
  const found: { start: number; end: number; span: Span }[] = []
  for (const span of spans) {
    const needle = fold(span.text).trim()
    if (!needle) continue
    const start = hay.indexOf(needle)
    if (start >= 0) found.push({ start, end: start + needle.length, span })
  }
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
  const chosen: typeof found = []
  for (const f of found) {
    if (chosen.every((c) => f.end <= c.start || f.start >= c.end)) chosen.push(f)
  }
  chosen.sort((a, b) => a.start - b.start)

  const out: Segment[] = []
  let pos = 0
  for (const c of chosen) {
    if (c.start > pos) out.push({ text: line.slice(pos, c.start) })
    out.push({ text: line.slice(c.start, c.end), id: c.span.id, className: c.span.className })
    pos = c.end
  }
  if (pos < line.length) out.push({ text: line.slice(pos) })
  return out
}

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
