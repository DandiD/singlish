import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { readFileSync } from 'node:fs'
import { MilestoneSheet } from '../../src/ui/components/MilestoneSheet'

afterEach(cleanup)
const milestone = { id: 'week-goal' as const, title: 'Una settimana a ritmo', text: "Hai raggiunto l'obiettivo della settimana." }

test('foglio modale con titolo e frase, fuoco sul foglio, «Bene» chiude', () => {
  const onClose = vi.fn()
  render(<MilestoneSheet milestone={milestone} onClose={onClose} />)
  const dialog = screen.getByRole('dialog', { name: 'Una settimana a ritmo' })
  expect(dialog.getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(dialog)
  expect(screen.getByText("Hai raggiunto l'obiettivo della settimana.")).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Bene' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('Esc e tocco sullo sfondo chiudono; un tocco dentro il foglio no', () => {
  const onClose = vi.fn()
  const { container } = render(<MilestoneSheet milestone={milestone} onClose={onClose} />)
  fireEvent.click(screen.getByRole('dialog'))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(container.querySelector('.sheet-scrim')!)
  expect(onClose).toHaveBeenCalledTimes(2)
})

test('vibra una volta all\'apertura, non con haptics spento', () => {
  const vibrate = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
  try {
    const a = render(<MilestoneSheet milestone={milestone} onClose={() => {}} haptics />)
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(10)
    a.unmount()
    vibrate.mockClear()
    render(<MilestoneSheet milestone={milestone} onClose={() => {}} haptics={false} />)
    expect(vibrate).not.toHaveBeenCalled()
  } finally {
    delete (navigator as unknown as Record<string, unknown>).vibrate
  }
})

test('motion.css ha l\'impulso del foglio e la sua regola ridotta', () => {
  const css = readFileSync('src/styles/motion.css', 'utf8')
  expect(css).toMatch(/\.sheet\.milestone[^{]*\{[^}]*animation:[^}]*var\(--t-med\)/)
  expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.sheet\.milestone[^}]*animation: none/)
})
