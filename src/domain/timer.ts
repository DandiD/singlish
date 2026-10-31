import type { TimerState } from '../db/types'

export function startTimer(durationMs: number, now: number): TimerState {
  return { status: 'running', durationMs, accumulatedMs: 0, resumedAt: now }
}

export function elapsedMs(s: TimerState, now: number): number {
  const running = s.status === 'running' && s.resumedAt !== null ? now - s.resumedAt : 0
  return s.accumulatedMs + Math.max(0, running)
}

export function remainingMs(s: TimerState, now: number): number {
  return Math.max(0, s.durationMs - elapsedMs(s, now))
}

export function isExpired(s: TimerState, now: number): boolean {
  return elapsedMs(s, now) >= s.durationMs
}

export function pauseTimer(s: TimerState, now: number): TimerState {
  if (s.status !== 'running') return s
  return { ...s, status: 'paused', accumulatedMs: elapsedMs(s, now), resumedAt: null }
}

export function resumeTimer(s: TimerState, now: number): TimerState {
  if (s.status !== 'paused') return s
  return { ...s, status: 'running', resumedAt: now }
}

export function stopTimer(s: TimerState, now: number): TimerState {
  if (s.status !== 'running' && s.status !== 'paused') return s
  return { ...s, status: 'stopped', accumulatedMs: elapsedMs(s, now), resumedAt: null }
}

export function extendTimer(s: TimerState, ms: number): TimerState {
  return { ...s, durationMs: s.durationMs + ms }
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
