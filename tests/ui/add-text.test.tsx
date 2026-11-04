import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { AddSong } from '../../src/ui/screens/AddSong'
import { Songs } from '../../src/ui/screens/Songs'
import { parseRoute, href } from '../../src/router'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()); localStorage.clear(); window.location.hash = '#/songs/new-text' })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta di Aggiungi testo, distinta dallo studio di una canzone', () => {
  expect(parseRoute('#/songs/new-text')).toEqual({ name: 'addText' })
  expect(href({ name: 'addText' })).toBe('#/songs/new-text')
})

test('si sceglie la fonte, si incolla il testo e si salva come testo libero', async () => {
  mount(<AddSong kind="text" />)
  expect(screen.getByRole('heading', { name: 'Aggiungi testo', level: 1 })).toBeTruthy()
  expect(screen.queryByLabelText('Link Spotify')).toBeNull()
  expect(screen.queryByLabelText('Quanto hai capito?')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Podcast' }))
  expect(screen.getByRole('button', { name: 'Podcast' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.input(screen.getByLabelText('Titolo'), { target: { value: 'Puntata 12' } })
  fireEvent.input(screen.getByLabelText('Testo incollato'), { target: { value: 'We dropped the ball.\nNow we scramble.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
  await waitFor(async () => expect(await db.songs.count()).toBe(1))
  expect((await db.songs.toArray())[0]).toMatchObject({ kind: 'text', source: 'podcast', title: 'Puntata 12' })
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/songs\/[^/]+\/analyzing$/))
})

test('in Canzoni si aggiunge anche un testo, e un testo ha la sua etichetta', async () => {
  const { createSong } = await import('../../src/domain/ingest')
  await createSong(db, { title: 'Articolo sul clima', artist: '', spotifyUrl: null, rawText: 'x', comprehensionBefore: null, kind: 'text', source: 'articolo' }, now)
  mount(<Songs />)
  expect((await screen.findByRole('link', { name: 'Aggiungi testo' })).getAttribute('href')).toBe('#/songs/new-text')
  const card = screen.getByRole('heading', { name: 'Articolo sul clima' }).closest('li')!
  expect(card.textContent).toContain('Articolo')
})
