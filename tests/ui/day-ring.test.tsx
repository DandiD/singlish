import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { DayRing, RING_CIRCUMFERENCE } from '../../src/ui/components/DayRing'
import { dayRing } from '../../src/domain/today'

afterEach(cleanup)

function ring(done: number, left: number, blocked = false, extra: { why?: string | null } = {}) {
  return render(<DayRing ring={dayRing({ done, left, blocked })} estMinutes={12} timerMinutes={30} label="Etichetta breve" why={extra.why ?? null} />)
}
const arc = (c: Element) => c.querySelector('.day-ring-arc') as SVGElement

describe('DayRing', () => {
  test('aria-label describes the four states', () => {
    ring(0, 5)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('0 di 5 card fatte oggi')
    cleanup(); ring(3, 2)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('3 di 5 card fatte oggi')
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
})
