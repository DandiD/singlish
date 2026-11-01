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
  const secs = Math.floor(remaining / 1000)
  const label = running
    ? `Timer, ${Math.floor(secs / 60)} minuti e ${secs % 60} secondi rimasti. Metti in pausa`
    : 'Timer in pausa. Riprendi'
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
      {formatMmSs(remaining)}
    </button>
  )
}
