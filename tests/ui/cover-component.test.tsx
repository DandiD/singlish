import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/preact'
import { Cover } from '../../src/ui/components/Cover'
import { songLook, type Motif } from '../../src/ui/cover'

afterEach(cleanup)

const URL_A = 'https://i.scdn.co/image/aaa'
const URL_B = 'https://i.scdn.co/image/bbb'

function song(over: Partial<Parameters<typeof Cover>[0]['song']> = {}) {
  return { id: 'song-1', title: 'Paper Lanterns', kind: 'song' as const, coverUrl: undefined, ...over }
}

function idWithMotif(motif: Motif): string {
  for (let i = 0; i < 500; i++) if (songLook(`id-${i}`).motif === motif) return `id-${i}`
  throw new Error('no id found')
}

const root = (c: Element) => c.querySelector('.cover')!

describe('Cover', () => {
  test('shows the Spotify image when there is one', () => {
    const { container } = render(<Cover song={song({ coverUrl: URL_A })} size="md" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(URL_A)
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('crossorigin')).toBe('anonymous')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(container.textContent).toBe('')
  })

  test('falls back to the generated cover when the image fails, and does not retry', () => {
    const s = song({ coverUrl: URL_A })
    const { container, rerender } = render(<Cover song={s} size="md" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('PL')
    rerender(<Cover song={{ ...s }} size="md" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('PL')
  })

  test('a new URL after an error gets a new try', () => {
    const { container, rerender } = render(<Cover song={song({ coverUrl: URL_A })} size="md" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    rerender(<Cover song={song({ coverUrl: URL_B })} size="md" />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(URL_B)
  })

  test.each([[null], [undefined]])('generated cover for coverUrl %s', (coverUrl) => {
    const { container } = render(<Cover song={song({ coverUrl })} size="md" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('PL')
    expect(root(container).classList.contains(`song-hue-${songLook('song-1').hue}`)).toBe(true)
  })

  test.each(['https://evil.example/x.jpg', 'http://i.scdn.co/x.jpg', ''])(
    'a coverUrl outside the Spotify CDNs (%s) is never loaded',
    (coverUrl) => {
      const { container } = render(<Cover song={song({ coverUrl })} size="md" />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.textContent).toBe('PL')
    },
  )

  test('a text never shows an image, even with a coverUrl', () => {
    const { container } = render(<Cover song={song({ kind: 'text', coverUrl: URL_A })} size="md" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.cover-initials')!.textContent).toBe('PL')
  })

  test.each(['waves', 'circles', 'lines'] as const)('draws the %s motif', (motif) => {
    const id = idWithMotif(motif)
    const { container } = render(<Cover song={song({ id })} size="md" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('data-motif')).toBe(motif)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    const counts = (tag: string) => svg.querySelectorAll(tag).length
    if (motif === 'waves') expect([counts('path'), counts('circle')]).toEqual([3, 0])
    if (motif === 'circles') expect([counts('path'), counts('circle')]).toEqual([0, 3])
    if (motif === 'lines') expect([counts('path'), counts('circle')]).toEqual([4, 0])
    expect(root(container).classList.contains(`song-hue-${songLook(id).hue}`)).toBe(true)
  })

  test.each(['sm', 'md', 'lg'] as const)('size class %s', (size) => {
    const { container } = render(<Cover song={song()} size={size} />)
    expect(root(container).classList.contains(`cover-${size}`)).toBe(true)
  })

  test('hidden from screen readers', () => {
    const { container } = render(<Cover song={song()} size="sm" />)
    expect(root(container).getAttribute('aria-hidden')).toBe('true')
  })
})
