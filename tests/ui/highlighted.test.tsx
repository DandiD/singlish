import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Highlighted, highlightLine } from '../../src/ui/components/Highlighted'

describe('highlightLine', () => {
  test('highlights case-insensitively and survives misses', () => {
    const out = highlightLine('Every night I Let It Slide', [
      { text: 'let it slide', id: 'c1', className: 'id' },
      { text: 'missing', id: 'c2', className: 'ph' },
    ])
    expect(out).toEqual([{ text: 'Every night I ' }, { text: 'Let It Slide', id: 'c1', className: 'id' }])
  })

  test('typographic apostrophe in the line matches a straight one in the span', () => {
    const out = highlightLine('But I’m over it now', [{ text: "i'm over it", id: 'c1', className: 'co' }])
    expect(out).toEqual([{ text: 'But ' }, { text: 'I’m over it', id: 'c1', className: 'co' }, { text: ' now' }])
  })

  test('overlapping spans: the longest wins', () => {
    const out = highlightLine('So call it off now', [
      { text: 'call it', id: 'a', className: 'ph' },
      { text: 'call it off', id: 'b', className: 'ph' },
    ])
    expect(out).toEqual([{ text: 'So ' }, { text: 'call it off', id: 'b', className: 'ph' }, { text: ' now' }])
  })

  test('line without matches stays intact', () => {
    expect(highlightLine('Nothing here', [{ text: 'zzz', id: 'x', className: 'w' }])).toEqual([{ text: 'Nothing here' }])
  })
})

describe('Highlighted con onPick', () => {
  afterEach(() => cleanup())
  test('le voci sono pulsanti: tocco, Invio e Spazio passano l\'id senza arrivare al contenitore; aria-expanded segue openId', () => {
    const onPick = vi.fn()
    const outer = vi.fn()
    render(
      <p onClick={outer}>
        <Highlighted line="We let it slide tonight" spans={[{ text: 'let it slide', id: 'c1', className: 'id' }]} onPick={onPick} openId="c1" />
      </p>,
    )
    const item = screen.getByRole('button', { name: 'let it slide' })
    expect(item.tagName).toBe('SPAN')
    expect(item.getAttribute('tabindex')).toBe('0')
    expect(item.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(item)
    expect(onPick).toHaveBeenCalledWith('c1')
    expect(outer).not.toHaveBeenCalled()
    fireEvent.keyDown(item, { key: 'Enter' })
    fireEvent.keyDown(item, { key: ' ' })
    expect(onPick).toHaveBeenCalledTimes(3)
    fireEvent.keyDown(item, { key: 'a' })
    expect(onPick).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('button', { name: 'We' })).toBeNull()
  })
})
