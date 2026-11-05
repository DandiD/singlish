import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { WeekRhythm, resetRhythmPulse } from '../../src/ui/components/WeekRhythm'
import { weekRhythm } from '../../src/domain/rhythm'

afterEach(cleanup)
beforeEach(resetRhythmPulse)

// Giovedì 5 novembre 2026; settimana dal 2 all'8.
const now = new Date(2026, 10, 5, 10, 0)
const rhythm = (days: string[], goal = 5) => weekRhythm({ reviewDays: new Set(days), freeDays: [], goal, now })
const mount = (r = rhythm(['2026-11-02', '2026-11-04']), key = '2026-11-02') => render(<WeekRhythm rhythm={r} weekKey={key} />)

describe('WeekRhythm', () => {
  test('a link to the Diary named after the rhythm text', () => {
    mount()
    const link = screen.getByRole('link', { name: 'Ritmo della settimana: 2 giorni su 5. Apri il Diario' })
    expect(link.getAttribute('href')).toBe('#/progress')
  })

  test('seven dots Monday to Sunday: check on active days, ring on today, future dimmed', () => {
    const { container } = mount()
    const dots = [...container.querySelectorAll('.week-dot')]
    expect(dots).toHaveLength(7)
    expect(dots.map((d) => d.querySelector('.week-dot-initial')!.textContent).join('')).toBe('LMMGVSD')
    expect(dots.map((d) => d.classList.contains('on'))).toEqual([true, false, true, false, false, false, false])
    expect(dots.map((d) => !!d.querySelector('svg'))).toEqual([true, false, true, false, false, false, false])
    expect(dots.map((d) => d.classList.contains('today'))).toEqual([false, false, false, true, false, false, false])
    expect(dots.map((d) => d.classList.contains('future'))).toEqual([false, false, false, false, true, true, true])
    // Le iniziali e i pallini sono nascosti allo screen reader: il nome del link dice tutto.
    expect(container.querySelector('.week-rhythm-dots')!.getAttribute('aria-hidden')).toBe('true')
  })

  test('lowered goal: never "4 giorni su 3", seven dots stay', () => {
    const { container } = mount(rhythm(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], 3))
    expect(screen.getByRole('link', { name: 'Ritmo della settimana: Obiettivo della settimana raggiunto · 4 giorni. Apri il Diario' })).toBeTruthy()
    expect(container.querySelectorAll('.week-dot')).toHaveLength(7)
    expect(container.querySelectorAll('.week-dot.on')).toHaveLength(4)
  })

  test('the reached pulse happens once per week key', () => {
    const reached = rhythm(['2026-11-02', '2026-11-03', '2026-11-04'], 3)
    const pulsing = (c: Element) => c.querySelector('.week-rhythm')!.classList.contains('week-rhythm--pulse')
    expect(pulsing(mount(reached).container)).toBe(true)
    cleanup()
    expect(pulsing(mount(reached).container)).toBe(false)
    cleanup()
    expect(pulsing(mount(reached, '2026-11-09').container)).toBe(true)
    cleanup()
    // Non raggiunto: nessun impulso.
    resetRhythmPulse()
    expect(pulsing(mount().container)).toBe(false)
  })
})
