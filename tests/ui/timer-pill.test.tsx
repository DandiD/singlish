import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/preact'
import { TimerPill } from '../../src/ui/components/TimerPill'
import type { TimerState } from '../../src/db/types'

const running: TimerState = { status: 'running', durationMs: 900000, accumulatedMs: 0, resumedAt: 0 }
const paused: TimerState = { status: 'paused', durationMs: 900000, accumulatedMs: 1000, resumedAt: null }

afterEach(cleanup)

describe('TimerPill', () => {
  test('paused: label has Riprendi, click resumes', () => {
    const onResume = vi.fn()
    render(<TimerPill state={paused} remaining={683000} expired={false} onPause={() => {}} onResume={onResume} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Riprendi')
    fireEvent.click(btn)
    expect(onResume).toHaveBeenCalledTimes(1)
  })
  test('running: label and click pauses', () => {
    const onPause = vi.fn()
    render(<TimerPill state={running} remaining={683000} expired={false} onPause={onPause} onResume={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toBe('Timer, 11 minuti e 23 secondi rimasti. Metti in pausa')
    expect(btn.textContent).toContain('11:23')
    fireEvent.click(btn)
    expect(onPause).toHaveBeenCalledTimes(1)
  })
})
