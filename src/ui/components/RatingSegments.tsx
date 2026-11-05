import type { SegmentKind } from '../../domain/sessionRhythm'

/** Una card per segmento; forma e colore dicono il voto, `label` lo dice anche a parole. */
export function RatingSegments({ segments, current, glow, label }: { segments: SegmentKind[]; current: number; glow: number[]; label: string }) {
  return (
    <div class="segs" role="img" aria-label={label}>
      {segments.map((kind, i) => (
        <span key={i} class={`seg seg-${kind}${i === current ? ' seg-current' : ''}${glow.includes(i) ? ' seg-glow' : ''}`} />
      ))}
    </div>
  )
}
