import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { FinalListen } from '../../src/ui/screens/FinalListen'
import { Today } from '../../src/ui/screens/Today'
import { Progress } from '../../src/ui/screens/Progress'
import { parseRoute, href } from '../../src/router'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
const song: Song = {
  id: 's1', kind: 'song', title: 'Glass Harbour', artist: '', spotifyUrl: 'https://open.spotify.com/track/abc123', lines: ['x'], status: 'studying',
  level: 'B1', difficultyKnownPct: 70, comprehensionBefore: 60, grammarPoint: null, connectedSpeech: [], addedAt: daysAgo(10), analyzedAt: daysAgo(10), studyStartedAt: daysAgo(8),
}
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1/final'; await db.songs.add(song) })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta del riascolto', () => {
  expect(parseRoute('#/songs/s1/final')).toEqual({ name: 'finalListen', songId: 's1' })
  expect(href({ name: 'finalListen', songId: 's1' })).toBe('#/songs/s1/final')
})

test('Oggi propone il riascolto della canzone in studio da 7 giorni', async () => {
  mount(<Today />)
  const link = await screen.findByRole('link', { name: /riascolto finale.*Glass Harbour/i })
  expect(link.getAttribute('href')).toBe('#/songs/s1/final')
})

test('si segna la % di adesso, si vede il guadagno, e Chiudi la canzone la completa', async () => {
  mount(<FinalListen songId="s1" />)
  expect(await screen.findByRole('heading', { name: 'Riascolto finale', level: 1 })).toBeTruthy()
  expect(screen.getByRole('link', { name: /Apri in Spotify/ }).getAttribute('href')).toBe(song.spotifyUrl)
  expect((screen.getByRole('button', { name: 'Chiudi la canzone' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.input(screen.getByLabelText('Quanto hai capito adesso?'), { target: { value: '78' } })
  expect(screen.getByText('+18')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi la canzone' }))
  await waitFor(async () => expect(await db.songs.get('s1')).toMatchObject({ comprehensionAfter: 78, status: 'done' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
})

test('Progressi mostra il guadagno medio dopo i riascolti', async () => {
  await db.songs.update('s1', { comprehensionAfter: 78, status: 'done' })
  mount(<Progress />)
  const tile = (await screen.findByText('Guadagno medio')).parentElement!
  expect(tile.textContent).toContain('+18')
})
