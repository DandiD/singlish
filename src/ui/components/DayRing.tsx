import { useId, useRef, useState } from 'preact/hooks'
import type { dayRing } from '../../domain/today'
import { plural } from '../plural'

const R = 52
export const RING_CIRCUMFERENCE = 2 * Math.PI * R

/** Il giorno (YYYY-MM-DD locale) in cui l'anello completo ha già pulsato: una volta sola al giorno, non a ogni ritorno su Oggi. */
let pulsedDay: string | null = null
export function resetRingPulse() {
  pulsedDay = null
}

type Props = {
  ring: ReturnType<typeof dayRing>
  estMinutes: number
  timerMinutes: number
  label: string
  why: string | null
  /** Il giorno locale di oggi, YYYY-MM-DD. */
  dayKey: string
}

export function DayRing({ ring, estMinutes, timerMinutes, label, why, dayKey }: Props) {
  const [open, setOpen] = useState(false)
  const whyId = useId()
  const { done, total, state, blocked } = ring
  const fraction = total === 0 ? 0 : done / total
  const offset = RING_CIRCUMFERENCE * (1 - fraction)
  const center = state === 'empty' ? '—' : state === 'done' ? done : total
  const showMinutes = state === 'todo' || state === 'partial'
  const aria = (total === 0 ? 'Nessuna card oggi' : `${done} di ${total} card fatte oggi`)
    + (showMinutes ? `, circa ${plural(estMinutes, 'minuto', 'minuti')} su ${timerMinutes}` : '')
    + (blocked ? ', card nuove in pausa' : '')
  // Chi pulsa lo tiene per tutto il montaggio (un nuovo render non toglie la classe a metà animazione).
  const pulseDay = useRef<string | null>(null)
  if (state === 'done' && pulsedDay !== dayKey) {
    pulsedDay = dayKey
    pulseDay.current = dayKey
  }
  const pulse = state === 'done' && pulseDay.current === dayKey

  return (
    <div class={`day-ring day-ring--${state}${blocked ? ' day-ring--blocked' : ''}${pulse ? ' day-ring--pulse' : ''}`}>
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
