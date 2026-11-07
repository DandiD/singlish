import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { saveSettings } from '../../src/domain/settings'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = {
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null,
  lines: ['I gave up on you, babe', 'paper lanterns drift', 'we sing it twice again', 'quiet rivers hold the moon'],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const item = {
  item_type: 'chunk', surface_form: 'gave up', widened: false, type: 'phrasal_verb', base_form: 'give up', cefr: 'B2', register: 'usable', topic: 'love',
  meaning_it: 'arrendersi', explanation_it: 'Smettere di provarci.', extra_example_en: 'Never give up.', production_prompt_it: 'Dì che ti arrendi.',
}
const answer = {
  answers: [
    { id: 'w1', translation_it: 'Ho rinunciato a te, tesoro', item, verse: null },
    { id: 'v1', translation_it: 'Lanterne di carta alla deriva', item: null, verse: { sense_it: 'Immagine di lanterne.', grammar_it: null, culture_it: null, proposals: [] } },
  ],
}
const ok = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1'; await db.songs.add(song); await saveSettings(db, { apiKey: 'k' }) })
afterEach(() => { cleanup(); db.close() })
const mount = (f: typeof fetch) => render(<AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}><Study songId="s1" /></AppDepsProvider>)
const enter = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a Gemini' }))
  return document.querySelector('.lyrics') as HTMLElement
}
const tap = (root: HTMLElement, name: string) => fireEvent.click(within(root).getByRole('button', { name }))
const bar = () => screen.getByRole('region', { name: 'Da chiedere a Gemini' })

test('due parole vicine si uniscono con ↔ e contano come una voce', async () => {
  mount(ok() as unknown as typeof fetch)
  const lyrics = await enter()
  expect(screen.getByText(/Il simbolo ↔ unisce/)).toBeTruthy()
  expect(bar().textContent).toContain('Niente da chiedere')
  tap(lyrics, 'gave'); tap(lyrics, 'up')
  expect(bar().textContent).toContain('2 voci')
  tap(lyrics, 'Unisci «gave» e «up»')
  const joint = within(lyrics).getByRole('button', { name: 'Separa «gave» e «up»' })
  expect(joint.getAttribute('aria-pressed')).toBe('true')
  expect(bar().textContent).toContain('1 voce')
  expect(bar().textContent).not.toContain('2 voci')
})

test('il numero del verso lo chiede intero', async () => {
  mount(ok() as unknown as typeof fetch)
  const lyrics = await enter()
  tap(lyrics, 'gave')
  tap(lyrics, 'Verso intero 2')
  expect(within(lyrics).getByRole('button', { name: 'Verso intero 2' }).getAttribute('aria-pressed')).toBe('true')
  expect(bar().textContent).toContain('1 verso · 1 voce')
})

test('la tredicesima voce è rifiutata con un avviso', async () => {
  mount(ok() as unknown as typeof fetch)
  const lyrics = await enter()
  const words = ['I', 'gave', 'up', 'on', 'you', 'babe', 'paper', 'lanterns', 'drift', 'we', 'sing', 'it']
  for (const w of words) tap(lyrics, w)
  expect(screen.queryByText('Massimo 12 per volta')).toBeNull()
  tap(lyrics, 'twice')
  expect(within(lyrics).getByRole('button', { name: 'twice' }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('status').textContent).toBe('Massimo 12 per volta')
  tap(lyrics, 'we')
  expect(screen.queryByText('Massimo 12 per volta')).toBeNull()
})

test('Annulla esce senza chiamare', async () => {
  const f = ok()
  mount(f as unknown as typeof fetch)
  const lyrics = await enter()
  tap(lyrics, 'gave')
  fireEvent.click(within(bar()).getByRole('button', { name: 'Annulla' }))
  expect(screen.queryByRole('region', { name: 'Da chiedere a Gemini' })).toBeNull()
  expect(f).not.toHaveBeenCalled()
})

test('l\'invio fa una sola chiamata, svuota la selezione e apre il foglio delle risposte', async () => {
  const f = ok()
  mount(f as unknown as typeof fetch)
  const lyrics = await enter()
  tap(lyrics, 'gave'); tap(lyrics, 'up'); tap(lyrics, 'Unisci «gave» e «up»')
  tap(lyrics, 'Verso intero 2')
  fireEvent.click(within(bar()).getByRole('button', { name: 'Chiedi a Gemini' }))
  await waitFor(() => expect(window.location.hash.endsWith('item=ask')).toBe(true))
  expect(f).toHaveBeenCalledTimes(1)
  const body = String((f.mock.calls[0][1] as RequestInit).body)
  expect(body).toContain('w1 · riga 0 · \\"gave up\\"')
  expect(body).toContain('v1 · riga 1')
  expect(screen.queryByRole('region', { name: 'Da chiedere a Gemini' })).toBeNull()
})

test('errore di Gemini: lo dice com\'è, e la selezione resta per riprovare', async () => {
  const f = vi.fn().mockResolvedValue(new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 }))
  mount(f as unknown as typeof fetch)
  const lyrics = await enter()
  tap(lyrics, 'gave')
  fireEvent.click(within(bar()).getByRole('button', { name: 'Chiedi a Gemini' }))
  expect(await screen.findByText(/La chiave Gemini non funziona/)).toBeTruthy()
  expect(within(lyrics).getByRole('button', { name: 'gave' }).getAttribute('aria-pressed')).toBe('true')
})
