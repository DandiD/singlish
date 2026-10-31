import { describe, expect, test } from 'vitest'
import {
  startTimer, pauseTimer, resumeTimer, stopTimer, extendTimer,
  elapsedMs, remainingMs, isExpired, formatMmSs,
} from '../../src/domain/timer'

describe('timer', () => {
  test('pause and resume exclude paused time', () => {
    let s = startTimer(30 * 60e3, 0)
    s = pauseTimer(s, 60e3); s = resumeTimer(s, 10 * 60e3)
    expect(elapsedMs(s, 11 * 60e3)).toBe(2 * 60e3)
  })
  test('survives reload: state is data, time is clock', () => {
    const saved = JSON.parse(JSON.stringify(startTimer(15 * 60e3, 1000)))
    expect(remainingMs(saved, 1000 + 5 * 60e3)).toBe(10 * 60e3)
  })
  test('expires and extends', () => {
    let s = startTimer(60e3, 0)
    expect(isExpired(s, 61e3)).toBe(true)
    s = extendTimer(s, 5 * 60e3); expect(isExpired(s, 61e3)).toBe(false)
  })
  test('remaining never negative', () => {
    expect(remainingMs(startTimer(1000, 0), 5000)).toBe(0)
  })
  test('resume on running is a no-op', () => {
    const s = startTimer(60e3, 0)
    expect(resumeTimer(s, 30e3)).toEqual(s)
  })
  test('pause on paused is a no-op', () => {
    const s = pauseTimer(startTimer(60e3, 0), 10e3)
    expect(pauseTimer(s, 20e3)).toEqual(s)
  })
  test('stop freezes elapsed', () => {
    const s = stopTimer(startTimer(60e3, 0), 10e3)
    expect(s.status).toBe('stopped')
    expect(elapsedMs(s, 10e3)).toBe(10e3)
    expect(elapsedMs(s, 50e3)).toBe(10e3)
  })
  test('format', () => {
    expect(formatMmSs(683000)).toBe('11:23')
    expect(formatMmSs(5000)).toBe('00:05')
    expect(formatMmSs(5999)).toBe('00:05')
    expect(formatMmSs(75 * 60e3)).toBe('75:00')
  })
})
