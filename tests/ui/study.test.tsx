import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { openSongCount } from '../../src/domain/ingest'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide'], status: 'studying', level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/songs/s1'
  await db.songs.add(song)
})
afterEach(() => {
  cleanup()
  db.close()
})

const mount = () =>
  render(
    <AppDepsProvider
      value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}
    >
      <Study songId="s1" />
    </AppDepsProvider>,
  )

test('Segna come completata asks for confirmation, then marks done and goes to Canzoni', async () => {
  mount()
  expect(await openSongCount(db)).toBe(1)
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completata' }))
  // in-page confirm: nothing changes yet
  expect((await db.songs.get('s1'))!.status).toBe('studying')
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect((await db.songs.get('s1'))!.status).toBe('done'))
  expect(await openSongCount(db)).toBe(0)
  expect(window.location.hash).toBe('#/songs')
})

test('cancelling the confirm leaves the song untouched', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completata' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
  expect((await db.songs.get('s1'))!.status).toBe('studying')
  expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
})
