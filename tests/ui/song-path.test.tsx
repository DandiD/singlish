import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/preact'
import { SongPath } from '../../src/ui/components/SongPath'
import type { Stage } from '../../src/domain/path'

afterEach(cleanup)

const stages: Stage[] = [
  { id: 'listen', name: 'Ascolto', state: 'done', detail: '40%', action: null },
  { id: 'analyze', name: 'Analisi', state: 'done', detail: null, action: null },
  { id: 'study', name: 'Studio', state: 'done', detail: null, action: null },
  { id: 'triage', name: 'Smista', state: 'partial', detail: '2 da fare', action: 'triage' },
  { id: 'review', name: 'Ripasso', state: 'todo', detail: '0 di 3', action: null },
  { id: 'final', name: 'Riascolto', state: 'current', detail: 'pronto', action: 'finalListen' },
]

describe('SongPath', () => {
  test('una voce per tappa, con nome, stato a parole e dettaglio', () => {
    render(<SongPath stages={stages} songId="s1" chorus={false} />)
    const list = screen.getByRole('list', { name: 'Percorso della canzone' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0].textContent).toBe('Ascolto, fatta, 40%')
    expect(items[1].textContent).toBe('Analisi, fatta')
    expect(items[4].textContent).toBe('Ripasso, da fare, 0 di 3')
  })

  test('link solo per le tappe con un\'azione', () => {
    render(<SongPath stages={stages} songId="s1" chorus={false} />)
    const links = within(screen.getByRole('list', { name: 'Percorso della canzone' })).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Smista, in corso, 2 da fare' }).getAttribute('href')).toBe('#/songs/s1/triage')
    expect(screen.getByRole('link', { name: 'Riascolto, ora, pronto' }).getAttribute('href')).toBe('#/songs/s1/final')
  })

  test('Analisi in corso porta all\'analisi', () => {
    const s: Stage[] = [{ id: 'analyze', name: 'Analisi', state: 'current', detail: null, action: 'analyzing' }]
    render(<SongPath stages={s} songId="s1" chorus={false} />)
    expect(screen.getByRole('link', { name: 'Analisi, ora' }).getAttribute('href')).toBe('#/songs/s1/analyzing')
  })

  test('con un ritornello la tappa Studio porta a «Ritornello a voce»', () => {
    render(<SongPath stages={stages} songId="s1" chorus />)
    expect(screen.getByRole('link', { name: 'Studio, fatta, Ritornello a voce' }).getAttribute('href')).toBe('#/songs/s1/chorus')
  })

  test('il pallino ha una forma per stato, nascosto ai lettori di schermo', () => {
    const { container } = render(<SongPath stages={stages} songId="s1" chorus={false} />)
    const dots = [...container.querySelectorAll('.path-dot')]
    expect(dots.map((d) => d.getAttribute('aria-hidden'))).toEqual(Array(6).fill('true'))
    expect(dots.map((d) => d.className)).toEqual([
      'path-dot dot-done', 'path-dot dot-done', 'path-dot dot-done', 'path-dot dot-partial', 'path-dot dot-todo', 'path-dot dot-current',
    ])
  })
})
