import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { MoreMenu } from '../../src/ui/components/MoreMenu'

afterEach(cleanup)

const setup = () => {
  const done = vi.fn()
  const del = vi.fn()
  render(
    <div>
      <p>fuori</p>
      <MoreMenu label="Altre azioni" items={[{ text: 'Segna come completata', onSelect: done }, { text: 'Elimina canzone', onSelect: del, danger: true }]} />
    </div>,
  )
  return { done, del, button: screen.getByRole('button', { name: 'Altre azioni' }) }
}

describe('MoreMenu', () => {
  test('chiuso all\'inizio, con aria-haspopup e aria-expanded', () => {
    const { button } = setup()
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('Invio apre e porta il fuoco sulla prima voce; Esc chiude e il fuoco torna al pulsante', () => {
    const { button } = setup()
    button.focus()
    fireEvent.keyDown(button, { key: 'Enter' })
    const menu = screen.getByRole('menu')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Segna come completata' }))
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Elimina canzone' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  test('un tocco fuori lo chiude', () => {
    const { button } = setup()
    fireEvent.click(button)
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('fuori'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('un tocco sul menu non lo chiude', () => {
    const { button } = setup()
    fireEvent.click(button)
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Elimina canzone' }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  test('scegliere una voce chiama onSelect e chiude il menu', () => {
    const { button, done, del } = setup()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Elimina canzone' }))
    expect(del).toHaveBeenCalledTimes(1)
    expect(done).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  test('un secondo tocco sul pulsante chiude', () => {
    const { button } = setup()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
