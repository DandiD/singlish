import type { TimerState } from '../../db/types'
import { formatMmSs } from '../../domain/timer'

export interface TimerPillProps {
  state: TimerState
  remaining: number
  expired: boolean
  onPause(): void
  onResume(): void
}

export function TimerPill({ state, remaining, expired, onPause, onResume }: TimerPillProps) {
  const running = state.status === 'running'
  const time = formatMmSs(remaining)
  // Il nome accessibile contiene il tempo visibile (WCAG 2.5.3).
  const label = running ? `Timer ${time}, metti in pausa` : `Timer ${time} in pausa, riprendi`
  return (
    <button
      type="button"
      class={`timer-pill mono${expired ? ' expired' : ''}`}
      aria-label={label}
      onClick={running ? onPause : onResume}
      style={{
        minHeight: '44px',
        minWidth: '44px',
        padding: '0 16px',
        borderRadius: '999px',
        border: '1px solid var(--line-strong)',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 500,
        fontSize: '16px',
        background: expired ? 'var(--accent)' : 'var(--surface)',
        color: expired ? 'var(--on-accent)' : 'var(--text)',
      }}
    >
      {time}
    </button>
  )
}
