import { useId, useState } from 'preact/hooks'
import type { dayRing } from '../../domain/today'

const R = 52
export const RING_CIRCUMFERENCE = 2 * Math.PI * R

type Props = {
  ring: ReturnType<typeof dayRing>
  estMinutes: number
  timerMinutes: number
  label: string
  why: string | null
}

export function DayRing({ ring, estMinutes, timerMinutes, label, why }: Props) {
  const [open, setOpen] = useState(false)
  const whyId = useId()
  const { done, total, state, blocked } = ring
  const fraction = total === 0 ? 0 : done / total
  const offset = RING_CIRCUMFERENCE * (1 - fraction)
  const center = state === 'empty' ? '—' : state === 'done' ? done : total
  const aria = total === 0 ? 'Nessuna card oggi' : `${done} di ${total} card fatte oggi`
  const showMinutes = state === 'todo' || state === 'partial'

  return (
    <div class={`day-ring day-ring--${state}${blocked ? ' day-ring--blocked' : ''}`}>
      <div class="day-ring-figure" role="img" aria-label={aria}>
        <svg class="day-ring-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle class="day-ring-track" cx="60" cy="60" r={R} />
          <circle
            class="day-ring-arc"
            cx="60"
            cy="60"
            r={R}
            stroke-dasharray={RING_CIRCUMFERENCE}
            stroke-dashoffset={offset}
            style={{ '--ring-c': RING_CIRCUMFERENCE }}
          />
        </svg>
        <div class="day-ring-center">
          <span class="display">{center}</span>
          {showMinutes && <span class="day-ring-min">{`~${estMinutes}′ di ${timerMinutes}′`}</span>}
        </div>
      </div>
      <p class="day-ring-label">{label}</p>
      {why !== null && (
        <>
          <button type="button" class="day-ring-why" aria-expanded={open} aria-controls={whyId} onClick={() => setOpen(!open)}>
            Perché?
          </button>
          <p id={whyId} class="day-ring-why-text" hidden={!open}>{why}</p>
        </>
      )}
    </div>
  )
}
