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
  localStorage.clear()
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

  test('link incollato per ultimo e invio subito: la canzone prende il titolo da Spotify', async () => {
    mount(<AddSong />, oembed('Midnight Harbor'))
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one\nline two' } })
    fireEvent.input(screen.getByLabelText('Link Spotify'), { target: { value: URL_OK } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    expect((await db.songs.toArray())[0].title).toBe('Midnight Harbor')
  })

  test('risposta di Spotify lenta: l\'invio la aspetta e salva il titolo', async () => {
    let release!: () => void
    const slow = vi.fn(() => new Promise<Response>((r) => { release = () => r(new Response(JSON.stringify({ title: 'Slow Tide' }), { status: 200 })) })) as unknown as typeof fetch
    mount(<AddSong />, slow)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one' } })
    const link = screen.getByLabelText('Link Spotify')
    fireEvent.input(link, { target: { value: URL_OK } })
    fireEvent.blur(link)
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await new Promise((r) => setTimeout(r, 20))
    release()
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    expect((await db.songs.toArray())[0].title).toBe('Slow Tide')
  })

  test('un titolo scritto a mano vince su quello di Spotify anche all\'invio', async () => {
    mount(<AddSong />, oembed('Other'))
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one' } })
    fireEvent.input(screen.getByLabelText('Titolo'), { target: { value: '  Mine  ' } })
    fireEvent.input(screen.getByLabelText('Link Spotify'), { target: { value: URL_OK } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    expect((await db.songs.toArray())[0].title).toBe('Mine')
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

describe('niente si perde nel modulo', () => {
  const fillAll = () => {
    fireEvent.input(screen.getByLabelText('Link Spotify'), { target: { value: URL_OK } })
    fireEvent.input(screen.getByLabelText('Titolo'), { target: { value: 'Bozza' } })
    fireEvent.input(screen.getByLabelText('Artista'), { target: { value: 'Qualcuno' } })
    fireEvent.input(screen.getByLabelText('Quanto hai capito?'), { target: { value: '30' } })
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one\nline two' } })
  }
  test('uscendo dall\'app (pagina ricaricata) il modulo si ritrova com\'era', async () => {
    mount(<AddSong />, oembed('X'))
    fillAll()
    cleanup()
    mount(<AddSong />, oembed('X'))
    expect((screen.getByLabelText('Link Spotify') as HTMLInputElement).value).toBe(URL_OK)
    expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('Bozza')
    expect((screen.getByLabelText('Artista') as HTMLInputElement).value).toBe('Qualcuno')
    expect((screen.getByLabelText('Quanto hai capito?') as HTMLInputElement).value).toBe('30')
    expect((screen.getByLabelText('Testo') as HTMLTextAreaElement).value).toBe('line one\nline two')
  })
  test('salvata la canzone, il modulo riparte vuoto', async () => {
    mount(<AddSong />, oembed('X'))
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    cleanup()
    mount(<AddSong />, oembed('X'))
    expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Testo') as HTMLTextAreaElement).value).toBe('')
  })
  test('la comprensione non indicata non si salva come 50%', async () => {
    mount(<AddSong />)
    expect(screen.getByText('—')).toBeTruthy()
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    expect((await db.songs.toArray())[0].comprehensionBefore).toBeNull()
  })
  test('la comprensione indicata si salva', async () => {
    mount(<AddSong />)
    fireEvent.input(screen.getByLabelText('Quanto hai capito?'), { target: { value: '50' } })
    expect(screen.getByText('50%')).toBeTruthy()
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one' } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await waitFor(async () => expect(await db.songs.count()).toBe(1))
    expect((await db.songs.toArray())[0].comprehensionBefore).toBe(50)
  })
  test('correggendo il link, il titolo preso da Spotify si aggiorna', async () => {
    const f = vi.fn(async (u: string) => new Response(JSON.stringify({ title: u.includes('abc123') ? 'Sbagliata' : 'Giusta' }), { status: 200 })) as unknown as typeof fetch
    mount(<AddSong />, f)
    const link = screen.getByLabelText('Link Spotify')
    fireEvent.input(link, { target: { value: URL_OK } })
    fireEvent.blur(link)
    await waitFor(() => expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('Sbagliata'))
    fireEvent.input(link, { target: { value: 'https://open.spotify.com/track/xyz789' } })
    fireEvent.blur(link)
    await waitFor(() => expect((screen.getByLabelText('Titolo') as HTMLInputElement).value).toBe('Giusta'))
  })
  test('tornando indietro mentre aspetta il titolo, la canzone non viene creata', async () => {
    let release!: () => void
    const slow = vi.fn(() => new Promise<Response>((r) => { release = () => r(new Response(JSON.stringify({ title: 'T' }), { status: 200 })) })) as unknown as typeof fetch
    mount(<AddSong />, slow)
    fireEvent.input(screen.getByLabelText('Testo'), { target: { value: 'line one' } })
    fireEvent.input(screen.getByLabelText('Link Spotify'), { target: { value: URL_OK } })
    fireEvent.click(screen.getByRole('button', { name: 'Analizza con Gemini' }))
    await new Promise((r) => setTimeout(r, 10))
    window.location.hash = '#/songs'
    cleanup()
    release()
    await new Promise((r) => setTimeout(r, 30))
    expect(await db.songs.count()).toBe(0)
    expect(window.location.hash).toBe('#/songs')
  })
})
