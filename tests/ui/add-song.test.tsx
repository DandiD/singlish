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

  test('only section headers (no lyric lines) disables submit', () => {
    mount(<AddSong />)
    const btn = screen.getByRole('button', { name: 'Analizza con Gemini' }) as HTMLButtonElement
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: '[Chorus]\n[Verse 2]' } })
    expect(btn.disabled).toBe(true)
  })

  test('AddSong is blocked by 3 analyzed + 1 queued songs', async () => {
    for (const status of ['analyzed', 'analyzed', 'analyzed', 'queued'] as const) {
      const s = await createSong(db, { title: 'S', artist: '', spotifyUrl: null, rawText: 'x', comprehensionBefore: 0 }, now)
      await db.songs.update(s.id, { status })
    }
    mount(<AddSong />)
    await screen.findByText('Hai già 4 canzoni aperte. Segnane una come completata per aggiungerne un\'altra.')
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'hello there' } })
    expect((screen.getByRole('button', { name: 'Analizza con Gemini' }) as HTMLButtonElement).disabled).toBe(true)
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
    await screen.findByText('Hai già 4 canzoni aperte. Segnane una come completata per aggiungerne un\'altra.')
    expect((screen.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('3 analyzed + 1 queued also disables Aggiungi', async () => {
    for (const status of ['analyzed', 'analyzed', 'analyzed', 'queued'] as const) {
      const s = await createSong(db, input, now)
      await db.songs.update(s.id, { status })
    }
    mount(<Songs />)
    await screen.findByText('Hai già 4 canzoni aperte. Segnane una come completata per aggiungerne un\'altra.')
    expect((screen.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('done songs do not count towards the limit', async () => {
    for (const status of ['done', 'done', 'done', 'done', 'analyzed'] as const) {
      const s = await createSong(db, input, now)
      await db.songs.update(s.id, { status })
    }
    mount(<Songs />)
    await screen.findAllByText('S')
    expect((screen.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(false)
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

  test('salvataggio non riuscito: messaggio completo, il pulsante torna attivo', async () => {
    mount(<AddSong />)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'one\ntwo' } })
    db.songs.add = (() => Promise.reject(Object.assign(new Error('q'), { name: 'QuotaExceededError' }))) as never
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Canzone non salvata. Spazio esaurito: il telefono non ha più spazio per i dati dell\'app. Libera spazio e riprova.')
    expect((screen.getByRole('button', { name: 'Analizza con Gemini' }) as HTMLButtonElement).disabled).toBe(false)
  })

  test('errore generico nel salvataggio: dice di riprovare', async () => {
    mount(<AddSong />)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'one\ntwo' } })
    db.songs.add = (() => Promise.reject(new Error('x'))) as never
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Canzone non salvata. Riprova.')
  })

  test('un link che non è di un brano Spotify lo dice, dopo aver lasciato il campo', async () => {
    mount(<AddSong />)
    const input = screen.getByLabelText('Link Spotify') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'https://open.spotify.com/album/abc' } })
    expect(screen.queryByText(/non è il link di un brano/)).toBeNull()
    fireEvent.blur(input)
    const msg = await screen.findByText('Questo non è il link di un brano Spotify. In Spotify tocca Condividi → Copia link del brano, oppure lascia il campo vuoto.')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(msg.id)
    fireEvent.input(input, { target: { value: 'https://open.spotify.com/track/1BwrMGGhPA6GarWIYaFrW8' } })
    expect(screen.queryByText(/non è il link di un brano/)).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })
})
