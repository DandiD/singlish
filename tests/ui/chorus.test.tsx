import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Chorus } from '../../src/ui/screens/Chorus'
import { Study } from '../../src/ui/screens/Study'
import { parseRoute, href } from '../../src/router'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const lines = ['verse one', 'Late train home, no one waiting', "I'm done with the waiting", 'verse two', 'Late train home, no one waiting', "I'm done with the waiting"]
const song: Song = { id: 's1', kind: 'song', title: 'Late Train Home', artist: '', spotifyUrl: 'https://open.spotify.com/track/abc123', lines, status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1/chorus'; await db.songs.add(song) })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta e ingresso dallo Studio, solo se c\'è un ritornello', async () => {
  expect(parseRoute('#/songs/s1/chorus')).toEqual({ name: 'chorus', songId: 's1' })
  expect(href({ name: 'chorus', songId: 's1' })).toBe('#/songs/s1/chorus')
  mount(<Study songId="s1" />)
  expect((await screen.findByRole('link', { name: 'Ritornello a voce' })).getAttribute('href')).toBe('#/songs/s1/chorus')
  cleanup()
  await db.songs.update('s1', { kind: 'text', source: 'podcast' })
  mount(<Study songId="s1" />)
  await screen.findByRole('heading', { name: 'Late Train Home' })
  expect(screen.queryByRole('link', { name: 'Ritornello a voce' })).toBeNull()
  cleanup()
  await db.songs.update('s1', { kind: 'song', lines: ['a b', 'c d'] })
  mount(<Study songId="s1" />)
  await screen.findByRole('heading', { name: 'Late Train Home' })
  expect(screen.queryByRole('link', { name: 'Ritornello a voce' })).toBeNull()
})

test('si copre una riga toccandola, Ancora conta un tentativo, Ce l\'ho lo segna', async () => {
  mount(<Chorus songId="s1" />)
  expect(await screen.findByRole('heading', { name: 'Ritornello a voce', level: 1 })).toBeTruthy()
  expect(screen.getByText('Late Train Home · tentativo 1')).toBeTruthy()
  const line = screen.getByRole('button', { name: 'Late train home, no one waiting' })
  fireEvent.click(line)
  expect(line.getAttribute('aria-pressed')).toBe('true')
  expect(line.textContent).not.toContain('Late train')
  expect(screen.getByRole('link', { name: /Apri in Spotify/ }).getAttribute('href')).toBe(song.spotifyUrl)
  fireEvent.click(screen.getByRole('button', { name: 'Ancora' }))
  expect(await screen.findByText('Late Train Home · tentativo 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: "Ce l'ho, senza testo" }))
  await waitFor(async () => expect((await db.songs.get('s1'))!.chorusDoneAt).toEqual(now))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/s1'))
})
