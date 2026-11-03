import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Progress } from '../../src/ui/screens/Progress'
import { Today } from '../../src/ui/screens/Today'
import { parseRoute, href } from '../../src/router'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const song = (id: string, day: number, before: number | null): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: before, grammarPoint: null, connectedSpeech: [], addedAt: new Date(now.getTime() - day * 86400000), analyzedAt: null,
})
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta e collegamento da Oggi', async () => {
  expect(parseRoute('#/progress')).toEqual({ name: 'progress' })
  expect(href({ name: 'progress' })).toBe('#/progress')
  mount(<Today />)
  expect((await screen.findByRole('link', { name: 'Progressi' })).getAttribute('href')).toBe('#/progress')
})

test('comprensione: grafico con i valori leggibili anche senza vederlo, e il valore attuale', async () => {
  await db.songs.bulkAdd([song('Prima', 20, 40), song('Seconda', 10, 55), song('Terza', 2, 62)])
  mount(<Progress />)
  expect(await screen.findByRole('heading', { name: 'Progressi', level: 1 })).toBeTruthy()
  const chart = screen.getByRole('img', { name: /Comprensione al primo ascolto per canzone: 40, 55, 62 per cento/ })
  expect(chart.querySelectorAll('circle')).toHaveLength(3)
  expect(screen.getByText('62%', { selector: '.big-num' })).toBeTruthy()
  const table = screen.getByRole('table', { name: 'Comprensione per canzone' })
  expect(table.textContent).toContain('Seconda')
  expect(table.textContent).toContain('55%')
})

test('senza dati: niente numeri inventati, e cosa fare', async () => {
  mount(<Progress />)
  expect(await screen.findByText(/Segna quanto capisci al primo ascolto/)).toBeTruthy()
  expect(screen.getByText('Memoria reale').parentElement!.textContent).toContain('—')
  expect(screen.queryByRole('img')).toBeNull()
})
