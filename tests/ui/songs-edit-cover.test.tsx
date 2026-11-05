import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Songs } from '../../src/ui/screens/Songs'
import { createSong } from '../../src/domain/ingest'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const A = 'https://open.spotify.com/track/abc123'
const B = 'https://open.spotify.com/track/zzz999'
const X = 'https://i.scdn.co/image/ab67616d00001e02aaaa'

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = ''
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  db.close()
})

function mount() {
  const f = vi.fn(async () => new Response(JSON.stringify({ title: 'Paper Lanterns' }), { status: 200 })) as unknown as typeof fetch
  return render(
    <AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}>
      <Songs />
    </AppDepsProvider>,
  )
}

async function seed() {
  const s = await createSong(db, { title: 'Paper Lanterns', artist: 'The Night Ferries', spotifyUrl: A, rawText: 'a\nb', comprehensionBefore: null }, now)
  await db.songs.update(s.id, { coverUrl: X })
  return s
}

async function openEdit() {
  const card = (await screen.findByRole('heading', { name: 'Paper Lanterns' })).closest('li')!
  fireEvent.click(within(card).getByRole('button', { name: 'Modifica' }))
  return card
}

test('Salva con un link diverso: la copertina vecchia sparisce dall\'oggetto salvato', async () => {
  const s = await seed()
  mount()
  const card = await openEdit()
  fireEvent.input(within(card).getByLabelText('Link Spotify'), { target: { value: B } })
  fireEvent.click(within(card).getByRole('button', { name: 'Salva' }))
  await waitFor(async () => expect((await db.songs.get(s.id))!.spotifyUrl).toBe(B))
  const stored = (await db.songs.get(s.id))!
  expect('coverUrl' in stored).toBe(false)
})

test('uscendo senza Salva con un link diverso: la copertina vecchia sparisce', async () => {
  const s = await seed()
  const { unmount } = mount()
  const card = await openEdit()
  fireEvent.input(within(card).getByLabelText('Link Spotify'), { target: { value: B } })
  unmount()
  await waitFor(async () => expect((await db.songs.get(s.id))!.spotifyUrl).toBe(B))
  const stored = (await db.songs.get(s.id))!
  expect('coverUrl' in stored).toBe(false)
})

test('Salva con lo stesso link e un titolo nuovo: la copertina resta', async () => {
  const s = await seed()
  mount()
  const card = await openEdit()
  fireEvent.input(within(card).getByLabelText('Titolo'), { target: { value: 'Glass Harbor' } })
  fireEvent.click(within(card).getByRole('button', { name: 'Salva' }))
  await waitFor(async () => expect((await db.songs.get(s.id))!.title).toBe('Glass Harbor'))
  expect((await db.songs.get(s.id))!.coverUrl).toBe(X)
})

test('uscendo con lo stesso link e un titolo nuovo: la copertina resta', async () => {
  const s = await seed()
  const { unmount } = mount()
  const card = await openEdit()
  fireEvent.input(within(card).getByLabelText('Titolo'), { target: { value: 'Glass Harbor' } })
  unmount()
  await waitFor(async () => expect((await db.songs.get(s.id))!.title).toBe('Glass Harbor'))
  expect((await db.songs.get(s.id))!.coverUrl).toBe(X)
})

test('uscendo con un link non valido: link e copertina restano quelli di prima', async () => {
  const s = await seed()
  const { unmount } = mount()
  const card = await openEdit()
  fireEvent.input(within(card).getByLabelText('Link Spotify'), { target: { value: 'https://example.com/x' } })
  fireEvent.input(within(card).getByLabelText('Titolo'), { target: { value: 'Glass Harbor' } })
  unmount()
  await waitFor(async () => expect((await db.songs.get(s.id))!.title).toBe('Glass Harbor'))
  const stored = (await db.songs.get(s.id))!
  expect(stored.spotifyUrl).toBe(A)
  expect(stored.coverUrl).toBe(X)
})
