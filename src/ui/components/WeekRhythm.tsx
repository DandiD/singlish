import { useRef } from 'preact/hooks'
import { href } from '../../router'
import { rhythmText, type WeekRhythm as Rhythm } from '../../domain/rhythm'
import { Icon } from './Icon'

/** La settimana (lunedì della settimana) in cui l'obiettivo raggiunto ha già pulsato: una volta per settimana e per avvio dell'app. */
let pulsedWeek: string | null = null
export function resetRhythmPulse() {
  pulsedWeek = null
}

const INITIALS = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export function WeekRhythm({ rhythm, weekKey }: { rhythm: Rhythm; weekKey: string }) {
  const text = rhythmText(rhythm)
  // Chi pulsa lo tiene per tutto il montaggio (un nuovo render non toglie la classe a metà animazione).
  const pulseWeek = useRef<string | null>(null)
  if (rhythm.reached && pulsedWeek !== weekKey) {
    pulsedWeek = weekKey
    pulseWeek.current = weekKey
  }
  const pulse = rhythm.reached && pulseWeek.current === weekKey
  return (
    <a
      class={`week-rhythm${rhythm.reached ? ' week-rhythm--reached' : ''}${pulse ? ' week-rhythm--pulse' : ''}`}
      href={href({ name: 'progress' })}
      aria-label={`Ritmo della settimana: ${text}. Apri il Diario`}
    >
      <span class="week-rhythm-dots" aria-hidden="true">
        {rhythm.days.map((d) => (
          <span key={d.key} class={`week-dot${d.active ? ' on' : ''}${d.today ? ' today' : ''}${d.future ? ' future' : ''}`}>
            <span class="week-dot-mark">{d.active && <Icon name="check" size={14} />}</span>
            <span class="week-dot-initial">{INITIALS[d.weekday]}</span>
          </span>
        ))}
      </span>
      <span class="week-rhythm-text" aria-hidden="true">{text}</span>
    </a>
  )
}
