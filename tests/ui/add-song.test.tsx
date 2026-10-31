import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import type { ComponentChild } from 'preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { AddSong } from '../../src/ui/screens/AddSong'
import { Songs } from '../../src/ui/screens/Songs'
import { createSong } from '../../src/domain/ingest'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const URL_OK = 'https://open.spotify.com/track/abc123'

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = ''
})
afterEach(() => {
  cleanup()
  db.close()
})

function mount(ui: ComponentChild, fakeFetch: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return render(
    <AppDepsProvider value={{ db, fetch: fakeFetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>,
  )
}

const oembed = (title: string) =>
  vi.fn(async () => new Response(JSON.stringify({ title }), { status: 200 })) as unknown as typeof fetch

describe('AddSong', () => {
  test('valid link prefills title via oEmbed on blur', async () => {
    mount(<AddSong />, oembed('Midnight Harbor'))
    const link = screen.getByLabelText('Link Spotify')
    fireEvent.input(link, { target: { value: URL_OK } })
    fireEvent.blur(link)
    await waitFor(() => expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('Midnight Harbor'))
  })

  test('does not overwrite a typed title', async () => {
    mount(<AddSong />, oembed('Other'))
    fireEvent.input(screen.getByLabelText('Titolo'), { target: { value: 'Mine' } })
    const link = screen.getByLabelText('Link Spotify')
    fireEvent.input(link, { target: { value: URL_OK } })
    fireEvent.blur(link)
    await new Promise((r) => setTimeout(r, 20))
    expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('Mine')
  })

  test('failing oEmbed leaves title empty', async () => {
    const f = vi.fn(async () => new Response('no', { status: 404 })) as unknown as typeof fetch
    mount(<AddSong />, f)
    const link = screen.getByLabelText('Link Spotify')
    fireEvent.input(link, { target: { value: URL_OK } })
    fireEvent.blur(link)
    await waitFor(() => expect(f).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('')
  })

  test('empty or whitespace text disables submit', () => {
    mount(<AddSong />)
    const btn = screen.getByRole('button', { name: 'Analizza con Gemini' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: '   \n ' } })
    expect(btn.disabled).toBe(true)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'hello there' } })
    expect(btn.disabled).toBe(false)
  })

  test('submit creates the song and goes to analyzing', async () => {
    mount(<AddSong />)
    fireEvent.input(screen.getByLabelText('Titolo'), { target: { value: 'T' } })
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'one\ntwo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/songs\/.+\/analyzing$/))
    const songs = await db.songs.toArray()
    expect(songs).toHaveLength(1)
    expect(songs[0].lines).toHaveLength(2)
  })
})

describe('Songs', () => {
  const input = { title: 'S', artist: 'A', spotifyUrl: null, rawText: 'x', comprehensionBefore: 40 }

  test('Aggiungi is disabled with note at 4 open songs', async () => {
    for (let i = 0; i < 4; i++) {
      const s = await createSong(db, { ...input, title: 'S' + i }, now)
      await db.songs.update(s.id, { status: 'studying' })
    }
    mount(<Songs />)
    await screen.findByText('Massimo 4 canzoni aperte')
    expect((screen.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('draft song shows Analizza ora', async () => {
    const s = await createSong(db, { ...input, title: 'Draft one' }, now)
    mount(<Songs />)
    await screen.findByText('Draft one')
    expect(screen.getByRole('link', { name: 'Analizza ora' }).getAttribute('href')).toBe(`#/songs/${s.id}/analyzing`)
  })

  test('shows status labels and percent before, queued has Analizza ora', async () => {
    const s = await createSong(db, { ...input, title: 'Queued one' }, now)
    await db.songs.update(s.id, { status: 'queued' })
    mount(<Songs />)
    await screen.findByText('Queued one')
    expect(screen.getByText('Da analizzare')).toBeTruthy()
    expect(screen.getByText('40% prima')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Analizza ora' }).getAttribute('href')).toBe(`#/songs/${s.id}/analyzing`)
    expect((screen.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
