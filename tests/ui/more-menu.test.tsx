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

  test('Freccia giù apre e porta il fuoco sulla prima voce; Esc chiude e il fuoco torna al pulsante', () => {
    const { button } = setup()
    button.focus()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
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

  test('Invio e Spazio sul pulsante non sono intercettati: il clic nativo apre e chiude', () => {
    const { button } = setup()
    button.focus()
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true) // non prevenuto
    expect(fireEvent.keyDown(button, { key: ' ' })).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(button) // il clic che il browser genera da Invio/Spazio
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Segna come completata' }))
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('Esc sul pulsante subito dopo l\'apertura chiude e lascia il fuoco al pulsante', () => {
    const { button } = setup()
    fireEvent.click(button)
    button.focus() // il fuoco non è ancora entrato nel menu
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  test('Esc con il fuoco sul body (clic sul bordo della lista) chiude', () => {
    const { button } = setup()
    fireEvent.click(button)
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  test('due menu: il fuoco che entra nel secondo chiude il primo', () => {
    render(
      <div>
        <MoreMenu label="Primo" items={[{ text: 'Uno', onSelect: () => {} }]} />
        <MoreMenu label="Secondo" items={[{ text: 'Due', onSelect: () => {} }]} />
      </div>,
    )
    const first = screen.getByRole('button', { name: 'Primo' })
    const second = screen.getByRole('button', { name: 'Secondo' })
    fireEvent.click(first)
    const item = screen.getByRole('menuitem', { name: 'Uno' })
    fireEvent.focusOut(item, { relatedTarget: second })
    second.focus()
    expect(screen.queryByRole('menu', { name: 'Primo' })).toBeNull()
    expect(first.getAttribute('aria-expanded')).toBe('false')
  })

  test('il fuoco che si sposta dentro il menu non lo chiude', () => {
    const { button } = setup()
    fireEvent.click(button)
    const a = screen.getByRole('menuitem', { name: 'Segna come completata' })
    const b = screen.getByRole('menuitem', { name: 'Elimina canzone' })
    fireEvent.focusOut(a, { relatedTarget: b })
    expect(screen.getByRole('menu')).toBeTruthy()
  })
})
