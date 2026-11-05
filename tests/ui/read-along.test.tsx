import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { ReadAlong } from '../../src/ui/screens/ReadAlong'
import { useWakeLock } from '../../src/ui/useWakeLock'
import type { Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-05T10:00:00Z')
// Testo inventato: righe vuote fra le strofe, un ritornello ripetuto.
const lines = [
  'Paper boats on a Monday',
  '',
  'Late train home, no one waiting',
  '   ',
  'I let it slide again',
  'Late train home, no one waiting',
]
const song: Song = { id: 's1', kind: 'song', title: 'Paper Boats', artist: '', spotifyUrl: 'https://open.spotify.com/track/abc123', lines, status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [{ lineIndex: 4, written: 'let it', sung: 'lerit', noteIt: 'la t si ammorbidisce' }], addedAt: now, analyzedAt: now }
const chunk: Chunk = { id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 4,
  contexts: [{ songId: 's1', lineIndex: 4 }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '', meaningIt: 'lasciar correre',
  explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false }

beforeEach(async () => {
  // Solo l'orologio è finto: la guardia di «Letta tutta» legge Date.now().
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/songs/s1'
  window.location.hash = '#/songs/s1/read'
  await db.songs.add(song)
  await db.chunks.add(chunk)
})
afterEach(() => { cleanup(); db.close(); delete (navigator as any).wakeLock; vi.useRealTimers() })
const mount = () => render(
  <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
    <ReadAlong songId="s1" />
  </AppDepsProvider>,
)
const current = () => document.querySelector('[aria-live="polite"]') as HTMLElement
const preview = () => document.querySelector('.ra-next') as HTMLElement | null
const zone = (side: 'prev' | 'next') => document.querySelector(`.ra-zone.${side}`) as HTMLElement

test('prima riga nella regione aria-live, la seconda in anteprima nascosta, righe vuote saltate', async () => {
  mount()
  expect(await screen.findByRole('heading', { name: 'Leggi a tempo', level: 1 })).toBeTruthy()
  expect(current().textContent).toContain('Paper boats on a Monday')
  expect(screen.getByText('Riga 1 di 4')).toBeTruthy()
  expect(preview()!.getAttribute('aria-hidden')).toBe('true')
  expect(preview()!.textContent).toContain('Late train home, no one waiting')
  expect(current().textContent).not.toContain('ritornello')
})

test('tocco a destra, ArrowRight e Space vanno avanti; tocco a sinistra e ArrowLeft indietro', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(zone('next'))
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
  expect(current().textContent).toContain('Late train home, no one waiting')
  expect(current().textContent).toContain('ritornello')
  fireEvent.keyDown(document, { key: 'ArrowRight' })
  expect(screen.getByText('Riga 3 di 4')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'ArrowLeft' })
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
  const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
  document.dispatchEvent(space)
  expect(space.defaultPrevented).toBe(true)
  await screen.findByText('Riga 3 di 4')
  fireEvent.keyDown(document, { key: 'PageUp' })
  fireEvent.click(zone('prev'))
  expect(screen.getByText('Riga 1 di 4')).toBeTruthy()
})

test('Indietro sulla prima riga non fa nulla; i pulsanti e ✕ non cambiano riga da soli', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(screen.getByRole('button', { name: 'Indietro' }))
  fireEvent.click(zone('prev'))
  fireEvent.keyDown(document, { key: 'ArrowLeft' })
  expect(screen.getByText('Riga 1 di 4')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Indietro' }))
  expect(screen.getByText('Riga 1 di 4')).toBeTruthy()
})

test('toccare una voce apre la nuvoletta col significato senza cambiare riga; Esc la chiude', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(zone('next'))
  fireEvent.click(zone('next'))
  await screen.findByText('Riga 3 di 4')
  // Solo le voci di studio, non il parlato connesso.
  const item = await screen.findByRole('button', { name: 'let it slide' })
  expect(document.querySelector('.ra-current .hl.cs')).toBeNull()
  fireEvent.click(item)
  expect(screen.getByText('lasciar correre')).toBeTruthy()
  expect(item.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText('Riga 3 di 4')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByText('lasciar correre')).toBeNull()
  expect(screen.getByText('Riga 3 di 4')).toBeTruthy()
  // Da tastiera: Spazio o Invio sulla voce la apre, senza cambiare riga.
  item.focus()
  fireEvent.keyDown(item, { key: ' ' })
  expect(screen.getByText('lasciar correre')).toBeTruthy()
  expect(screen.getByText('Riga 3 di 4')).toBeTruthy()
  fireEvent.keyDown(item, { key: 'Enter' })
  expect(screen.queryByText('lasciar correre')).toBeNull()
  // Un altro tocco chiude la nuvoletta senza avanzare.
  fireEvent.click(item)
  fireEvent.click(zone('next'))
  expect(screen.queryByText('lasciar correre')).toBeNull()
  expect(screen.getByText('Riga 3 di 4')).toBeTruthy()
})

test('sull\'ultima riga Avanti diventa «Letta tutta»: salva readAlongAt e torna allo Studio', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  expect(screen.getByText('Riga 4 di 4')).toBeTruthy()
  expect(preview()).toBeNull()
  // Sull'ultima riga tocchi e tasti non finiscono la lettura per sbaglio.
  fireEvent.click(zone('next'))
  fireEvent.keyDown(document, { key: 'ArrowRight' })
  expect((await db.songs.get('s1'))!.readAlongAt).toBeUndefined()
  // Passato il tempo di guardia dell'ultima riga, un doppio tocco salva una volta sola.
  vi.setSystemTime(Date.now() + 500)
  const done = screen.getByRole('button', { name: 'Letta tutta' })
  fireEvent.click(done)
  fireEvent.click(done)
  await waitFor(async () => expect((await db.songs.get('s1'))!.readAlongAt).toEqual(now))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/s1'))
})

test('doppio tocco su «Avanti» sulla penultima riga: «Letta tutta» è un altro pulsante e ignora i tocchi per 400 ms', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  const avanti = screen.getByRole('button', { name: 'Avanti' })
  fireEvent.click(avanti)
  const done = screen.getByRole('button', { name: 'Letta tutta' })
  expect(done).not.toBe(avanti)
  // Il secondo tocco del doppio tocco, e uno poco dopo: non finiscono la lettura.
  fireEvent.click(done)
  vi.setSystemTime(Date.now() + 300)
  fireEvent.click(done)
  await new Promise((r) => setTimeout(r, 30))
  expect((await db.songs.get('s1'))!.readAlongAt).toBeUndefined()
  expect(window.location.hash).toBe('#/songs/s1/read')
  vi.setSystemTime(Date.now() + 200)
  fireEvent.click(done)
  await waitFor(async () => expect((await db.songs.get('s1'))!.readAlongAt).toEqual(now))
})

test('da tastiera: «Avanti» col fuoco diventa «Letta tutta» e il fuoco passa al nuovo pulsante, senza attivarlo', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  const avanti = screen.getByRole('button', { name: 'Avanti' })
  avanti.focus()
  // Invio su un pulsante lo attiva con un click.
  for (let i = 0; i < 3; i++) fireEvent.click(document.activeElement as HTMLElement)
  expect(screen.getByText('Riga 4 di 4')).toBeTruthy()
  const done = screen.getByRole('button', { name: 'Letta tutta' })
  expect(document.activeElement).toBe(done)
  // Un Invio subito dopo non fa nulla (guardia di 400 ms).
  fireEvent.click(document.activeElement as HTMLElement)
  await new Promise((r) => setTimeout(r, 30))
  expect((await db.songs.get('s1'))!.readAlongAt).toBeUndefined()
  vi.setSystemTime(Date.now() + 500)
  fireEvent.click(document.activeElement as HTMLElement)
  await waitFor(async () => expect((await db.songs.get('s1'))!.readAlongAt).toEqual(now))
})

test('un tasto tenuto premuto (keydown ripetuto) non scorre le righe', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.keyDown(document, { key: 'ArrowRight' })
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'ArrowRight', repeat: true })
  fireEvent.keyDown(document, { key: 'PageDown', repeat: true })
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'ArrowLeft', repeat: true })
  expect(screen.getByText('Riga 2 di 4')).toBeTruthy()
})

test('la nuvoletta è una regione di stato: il lettore di schermo legge il significato', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(zone('next'))
  fireEvent.click(zone('next'))
  const item = await screen.findByRole('button', { name: 'let it slide' })
  fireEvent.click(item)
  expect(screen.getByRole('status').textContent).toContain('lasciar correre')
})

test('testo libero: «Leggi riga per riga», «Letto tutto», niente Spotify né ritornello', async () => {
  await db.songs.update('s1', { kind: 'text', source: 'podcast', spotifyUrl: null })
  mount()
  expect(await screen.findByRole('heading', { name: 'Leggi riga per riga', level: 1 })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Spotify/ })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Solo il ritornello' })).toBeNull()
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  expect(screen.getByRole('button', { name: 'Letto tutto' })).toBeTruthy()
})

test('canzone: link a Spotify e «Solo il ritornello» solo se c\'è un ritornello', async () => {
  mount()
  expect((await screen.findByRole('link', { name: /Apri in Spotify/ })).getAttribute('href')).toBe(song.spotifyUrl)
  const chorus = screen.getByRole('link', { name: 'Solo il ritornello' })
  expect(chorus.getAttribute('href')).toBe('#/songs/s1/chorus')
  cleanup()
  await db.songs.update('s1', { lines: ['one line', 'another line'] })
  mount()
  await screen.findByText('Riga 1 di 2')
  expect(screen.queryByRole('link', { name: 'Solo il ritornello' })).toBeNull()
})

test('✕ esce senza salvare', async () => {
  mount()
  await screen.findByText('Riga 1 di 4')
  fireEvent.click(screen.getByRole('button', { name: 'Avanti' }))
  const close = screen.getByRole('link', { name: 'Esci' })
  expect(close.getAttribute('href')).toBe('#/songs/s1')
  fireEvent.click(close)
  await waitFor(() => expect(window.location.hash).toBe('#/songs/s1'))
  expect((await db.songs.get('s1'))!.readAlongAt).toBeUndefined()
})

test('canzone inesistente → «Canzone non trovata»', async () => {
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <ReadAlong songId="nope" />
    </AppDepsProvider>,
  )
  expect(await screen.findByRole('heading', { name: 'Canzone non trovata' })).toBeTruthy()
})

function fakeWakeLock() {
  const sentinels: { release: ReturnType<typeof vi.fn>; released: boolean }[] = []
  const request = vi.fn(async () => { const s = { release: vi.fn(async () => {}), released: false }; sentinels.push(s); return s })
  ;(navigator as any).wakeLock = { request }
  return { request, sentinels }
}

test('la lettura tiene lo schermo acceso e lo rilascia uscendo', async () => {
  const wl = fakeWakeLock()
  const { unmount } = mount()
  await screen.findByText('Riga 1 di 4')
  await waitFor(() => expect(wl.sentinels).toHaveLength(1))
  expect(wl.request).toHaveBeenCalledWith('screen')
  unmount()
  await waitFor(() => expect(wl.sentinels[0].release).toHaveBeenCalled())
})

test('useWakeLock: chiede il blocco, lo rilascia allo smontaggio, anche se arriva dopo', async () => {
  const wl = fakeWakeLock()
  const a = renderHook(() => useWakeLock(true))
  await waitFor(() => expect(wl.sentinels).toHaveLength(1))
  await Promise.resolve()
  a.unmount()
  await waitFor(() => expect(wl.sentinels[0].release).toHaveBeenCalled())
  // Smontato prima che la richiesta risponda: il blocco arrivato tardi si rilascia subito.
  const b = renderHook(() => useWakeLock(true))
  b.unmount()
  await waitFor(() => expect(wl.sentinels).toHaveLength(2))
  await waitFor(() => expect(wl.sentinels[1].release).toHaveBeenCalled())
  // Inattivo: nessuna richiesta.
  renderHook(() => useWakeLock(false))
  expect(wl.request).toHaveBeenCalledTimes(2)
})

test('useWakeLock: tornando sulla scheda richiede il blocco che il sistema ha tolto', async () => {
  const wl = fakeWakeLock()
  renderHook(() => useWakeLock(true))
  await waitFor(() => expect(wl.sentinels).toHaveLength(1))
  const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  // Blocco ancora attivo: non se ne chiede un altro.
  document.dispatchEvent(new Event('visibilitychange'))
  expect(wl.request).toHaveBeenCalledTimes(1)
  // Il sistema lo toglie quando la scheda si nasconde: al ritorno si richiede.
  wl.sentinels[0].released = true
  document.dispatchEvent(new Event('visibilitychange'))
  await waitFor(() => expect(wl.request).toHaveBeenCalledTimes(2))
  vis.mockRestore()
})

test('useWakeLock: smontato, toglie l\'ascolto di visibilitychange e non richiede più il blocco', async () => {
  const wl = fakeWakeLock()
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const h = renderHook(() => useWakeLock(true))
  await waitFor(() => expect(wl.sentinels).toHaveLength(1))
  const listener = add.mock.calls.find((c) => c[0] === 'visibilitychange')![1]
  h.unmount()
  await waitFor(() => expect(remove).toHaveBeenCalledWith('visibilitychange', listener))
  const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  wl.sentinels[0].released = true
  document.dispatchEvent(new Event('visibilitychange'))
  await new Promise((r) => setTimeout(r, 10))
  expect(wl.request).toHaveBeenCalledTimes(1)
  vis.mockRestore()
  add.mockRestore()
  remove.mockRestore()
})
