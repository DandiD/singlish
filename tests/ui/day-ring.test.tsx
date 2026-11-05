import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { DayRing, RING_CIRCUMFERENCE, resetRingPulse } from '../../src/ui/components/DayRing'
import { dayRing } from '../../src/domain/today'

afterEach(cleanup)

function ring(done: number, left: number, blocked = false, extra: { why?: string | null; dayKey?: string; haptics?: boolean } = {}) {
  return render(<DayRing ring={dayRing({ done, left, blocked })} estMinutes={12} timerMinutes={30} label="Etichetta breve" why={extra.why ?? null} dayKey={extra.dayKey ?? '2026-11-05'} haptics={extra.haptics} />)
}
const arc = (c: Element) => c.querySelector('.day-ring-arc') as SVGElement

describe('DayRing', () => {
  test('aria-label describes the four states, with the minutes while cards are left', () => {
    ring(0, 5)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 di 5 card fatte oggi, circa 12 minuti su 30')
    cleanup(); ring(3, 2)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('3 di 5 card fatte oggi, circa 12 minuti su 30')
    cleanup(); ring(4, 0)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('4 di 4 card fatte oggi')
    cleanup(); ring(0, 0)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Nessuna card oggi')
  })

  test('center number per state; minutes only while cards are left', () => {
    const { container } = ring(0, 5)
    expect(container.querySelector('.display')!.textContent).toBe('5')
    expect(screen.getByText('~12′ di 30′')).toBeTruthy()
    cleanup()
    const p = ring(3, 2)
    expect(p.container.querySelector('.display')!.textContent).toBe('5')
    expect(screen.getByText('~12′ di 30′')).toBeTruthy()
    cleanup()
    const d = ring(4, 0)
    expect(d.container.querySelector('.display')!.textContent).toBe('4')
    expect(screen.queryByText(/′ di/)).toBeNull()
    cleanup()
    const e = ring(0, 0)
    expect(e.container.querySelector('.display')!.textContent).toBe('—')
    expect(screen.queryByText(/′ di/)).toBeNull()
  })

  test('aria-label says when new cards are paused', () => {
    ring(3, 2, true)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('3 di 5 card fatte oggi, circa 12 minuti su 30, card nuove in pausa')
    cleanup(); ring(0, 5, true)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 di 5 card fatte oggi, circa 12 minuti su 30, card nuove in pausa')
  })

  test('one minute is singular in the aria-label', () => {
    render(<DayRing ring={dayRing({ done: 0, left: 1, blocked: false })} estMinutes={1} timerMinutes={30} label="x" why={null} dayKey="2026-11-05" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 di 1 card fatte oggi, circa 1 minuto su 30')
  })

  test('visible label sits outside the role=img region', () => {
    ring(1, 1)
    expect(screen.getByRole('img').contains(screen.getByText('Etichetta breve'))).toBe(false)
  })

  test('state and blocked classes', () => {
    const { container } = ring(3, 2, true)
    const root = container.querySelector('.day-ring')!
    expect(root.classList.contains('day-ring--partial')).toBe(true)
    expect(root.classList.contains('day-ring--blocked')).toBe(true)
    cleanup()
    expect(ring(3, 2).container.querySelector('.day-ring--blocked')).toBeNull()
  })

  test('arc offset follows done/total, never NaN', () => {
    const { container } = ring(3, 2)
    expect(Number(arc(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(RING_CIRCUMFERENCE * (1 - 3 / 5), 5)
    cleanup()
    const z = ring(0, 0)
    expect(arc(z.container).getAttribute('stroke-dashoffset')).toBe(String(RING_CIRCUMFERENCE))
    cleanup()
    const f = ring(4, 0)
    expect(Number(arc(f.container).getAttribute('stroke-dashoffset'))).toBe(0)
  })

  test('no Perché? button without why', () => {
    ring(0, 5)
    expect(screen.queryByRole('button', { name: 'Perché?' })).toBeNull()
  })

  test('Perché? toggles the explanation; the text is always in the DOM', () => {
    ring(3, 2, true, { why: 'Le nuove sono trattenute.' })
    expect(screen.getByText('Le nuove sono trattenute.')).toBeTruthy()
    const btn = screen.getByRole('button', { name: 'Perché?' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    const target = screen.getByText('Le nuove sono trattenute.')
    expect(btn.getAttribute('aria-controls')).toBe(target.id)
    expect(target.id).not.toBe('')
    expect(target.hasAttribute('aria-hidden')).toBe(false)
    expect(target.hasAttribute('hidden')).toBe(true)
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(target.hasAttribute('hidden')).toBe(false)
    expect(target.textContent).toBe('Le nuove sono trattenute.')
    fireEvent.click(btn)
    expect(target.hasAttribute('hidden')).toBe(true)
  })

  test('«Fatto per oggi» pulsa una volta sola al giorno', () => {
    resetRingPulse()
    const pulsing = (c: Element) => c.querySelector('.day-ring')!.classList.contains('day-ring--pulse')
    expect(pulsing(ring(4, 0).container)).toBe(true)
    cleanup()
    expect(pulsing(ring(4, 0).container)).toBe(false)
    cleanup()
    expect(pulsing(ring(4, 0, false, { dayKey: '2026-11-06' }).container)).toBe(true)
    cleanup()
    // Solo lo stato «done» pulsa.
    resetRingPulse()
    expect(pulsing(ring(3, 2).container)).toBe(false)
    expect(pulsing(ring(4, 0).container)).toBe(true)
  })
})

describe('DayRing haptics', () => {
  const orig = Object.getOwnPropertyDescriptor(navigator, 'vibrate')
  let vibrate: ReturnType<typeof vi.fn>
  beforeEach(() => {
    resetRingPulse()
    vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
  })
  afterEach(() => {
    if (orig) Object.defineProperty(navigator, 'vibrate', orig)
    else delete (navigator as unknown as Record<string, unknown>).vibrate
  })

  test('closing the ring vibrates the first time for the day, not the second', () => {
    ring(4, 0)
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(10)
    cleanup()
    ring(4, 0)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
  test('not done: no vibration; haptics false: none', () => {
    ring(3, 2)
    expect(vibrate).not.toHaveBeenCalled()
    cleanup()
    ring(4, 0, false, { haptics: false })
    expect(vibrate).not.toHaveBeenCalled()
  })
})
