import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { db as defaultDb } from '../db/db'
import type { SinglishDB } from '../db/db'
import type { TimerState } from '../db/types'
import {
  extendTimer, isExpired, pauseTimer, remainingMs, resumeTimer, stopTimer,
} from '../domain/timer'

export interface UseTimerOpts { autoPauseOnHide: boolean; wakeLock: boolean }

const IDLE: TimerState = { status: 'idle', durationMs: 0, accumulatedMs: 0, resumedAt: null }

export function useTimer(sessionId: string, opts: UseTimerOpts, db: SinglishDB = defaultDb) {
  const [state, setState] = useState<TimerState>(IDLE)
  const [now, setNow] = useState(() => Date.now())
  const stateRef = useRef(state)
  stateRef.current = state
  const loaded = useRef(false)
  const vibrated = useRef(false)
  const lock = useRef<{ release(): Promise<void> } | null>(null)

  const apply = useCallback((next: TimerState) => {
    stateRef.current = next
    setState(next)
    setNow(Date.now())
    void db.sessions.update(sessionId, { timer: next })
  }, [db, sessionId])

  useEffect(() => {
    let cancelled = false
    loaded.current = false
    void db.sessions.get(sessionId).then(row => {
      if (cancelled || !row) return
      stateRef.current = row.timer
      setState(row.timer)
      setNow(Date.now())
      loaded.current = true
    })
    return () => { cancelled = true }
  }, [db, sessionId])

  const running = state.status === 'running'

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!opts.autoPauseOnHide) return
    const onVis = () => {
      if (document.visibilityState === 'hidden' && stateRef.current.status === 'running') {
        apply(pauseTimer(stateRef.current, Date.now()))
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [opts.autoPauseOnHide, apply])

  useEffect(() => {
    const release = () => {
      const l = lock.current
      lock.current = null
      try { void l?.release().catch(() => {}) } catch { /* ignore */ }
    }
    if (running && opts.wakeLock) {
      try {
        const wl = (navigator as any).wakeLock
        if (wl?.request) {
          Promise.resolve(wl.request('screen')).then(
            (l: { release(): Promise<void> }) => { lock.current = l },
            () => {},
          )
        }
      } catch { /* ignore */ }
    }
    return release
  }, [running, opts.wakeLock])

  const expired = state.status !== 'idle' && isExpired(state, now)

  useEffect(() => {
    if (expired && !vibrated.current) {
      vibrated.current = true
      try { navigator.vibrate?.(200) } catch { /* ignore */ }
    } else if (!expired) {
      vibrated.current = false
    }
  }, [expired])

  return {
    state,
    remaining: remainingMs(state, now),
    expired,
    pause: () => apply(pauseTimer(stateRef.current, Date.now())),
    resume: () => apply(resumeTimer(stateRef.current, Date.now())),
    stop: () => apply(stopTimer(stateRef.current, Date.now())),
    extend: (ms: number) => apply(extendTimer(stateRef.current, ms)),
  }
}
