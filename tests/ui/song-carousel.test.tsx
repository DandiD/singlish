import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { SongCarousel, type CarouselItem } from '../../src/ui/components/SongCarousel'

afterEach(cleanup)

function item(over: Partial<CarouselItem> & { id?: string; title?: string } = {}): CarouselItem {
  const { id = 's1', title = 'Paper Lanterns', ...rest } = over
  return {
    song: { id, title, kind: 'song', coverUrl: undefined },
    href: `#/songs/${id}`,
    label: '3 da fare',
    detail: 'Oggi: 3 card da ripassare in questa canzone',
    progress: null,
    ...rest,
  } as CarouselItem
}

describe('SongCarousel', () => {
  test('one link per song, named by title, label and detail', () => {
    render(
      <SongCarousel
        items={[item(), item({ id: 's2', title: 'Night Bus', label: 'Riascolto pronto', detail: 'Oggi: riascolto finale' })]}
        onAdd={null}
        addHref="#/add"
      />,
    )
    const a = screen.getByRole('link', { name: /Paper Lanterns.*3 da fare.*3 card da ripassare/ })
    expect(a.getAttribute('href')).toBe('#/songs/s1')
    const b = screen.getByRole('link', { name: /Night Bus.*Riascolto pronto.*riascolto finale/ })
    expect(b.getAttribute('href')).toBe('#/songs/s2')
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  test('the detail sentence is in the DOM but visually hidden', () => {
    const { container } = render(<SongCarousel items={[item()]} onAdd={null} addHref="#/add" />)
    const hidden = container.querySelector('.visually-hidden')!
    expect(hidden.textContent).toBe('Oggi: 3 card da ripassare in questa canzone')
  })

  test('progress draws a ring with the fraction; null draws none', () => {
    const { container, rerender } = render(<SongCarousel items={[item({ progress: 0.5 })]} onAdd={null} addHref="#/add" />)
    const ring = container.querySelector<HTMLElement>('.song-carousel-ring')!
    expect(ring.getAttribute('style')).toContain('0.5turn')
    rerender(<SongCarousel items={[item({ progress: null })]} onAdd={null} addHref="#/add" />)
    expect(container.querySelector('.song-carousel-ring')).toBeNull()
    expect(container.querySelector('[style*="--p"]')).toBeNull()
  })

  test('Aggiungi calls onAdd once and does not navigate', () => {
    const onAdd = vi.fn()
    render(<SongCarousel items={[item()]} onAdd={onAdd} addHref="#/add" />)
    const add = screen.getByRole('link', { name: /Aggiungi/ })
    expect(add.getAttribute('href')).toBe('#/add')
    const notPrevented = fireEvent.click(add)
    expect(notPrevented).toBe(false)
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  test('no Aggiungi when onAdd is null', () => {
    render(<SongCarousel items={[item()]} onAdd={null} addHref="#/add" />)
    expect(screen.queryByRole('link', { name: /Aggiungi/ })).toBeNull()
  })
})
