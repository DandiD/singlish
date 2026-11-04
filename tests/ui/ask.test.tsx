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
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null, lines: ['We dropped the ball on this one', 'now we scramble'],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const answer = {
  chunks: [{ base_form: 'drop the ball', surface_form: 'dropped the ball', line_index: 0, type: 'idiom', cefr: 'B2', register: 'informal', topic: 'work',
    meaning_it: 'fare un errore', explanation_it: 'Sbagliare.', extra_example_en: 'I dropped the ball.', production_prompt_it: 'Ammetti un errore.' }],
  words: [], line_translations: [],
}
const ok = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1'; await db.songs.add(song); await saveSettings(db, { apiKey: 'k' }) })
afterEach(() => { cleanup(); db.close() })
const mount = (f: typeof fetch) => render(<AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}><Study songId="s1" /></AppDepsProvider>)

test('si segnano più parole, parole vicine fanno un\'espressione, e parte una sola chiamata', async () => {
  const f = ok()
  mount(f as unknown as typeof fetch)
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a Gemini' }))
  expect(screen.getByText(/Leggi tutto il testo/)).toBeTruthy()
  const lyrics = document.querySelector('.lyrics') as HTMLElement
  for (const w of ['dropped', 'the', 'ball']) fireEvent.click(within(lyrics).getByRole('button', { name: w }))
  fireEvent.click(within(lyrics).getByRole('button', { name: 'scramble' }))
  expect(within(lyrics).getByRole('button', { name: 'ball' }).getAttribute('aria-pressed')).toBe('true')
  const bar = screen.getByRole('region', { name: 'Da chiedere a Gemini' })
  expect(bar.textContent).toContain('2 da chiedere')
  fireEvent.click(within(bar).getByRole('button', { name: 'Chiedi a Gemini' }))
  expect(await screen.findByText(/1 voce aggiunta al ripasso/)).toBeTruthy()
  expect(f).toHaveBeenCalledTimes(1)
  expect(JSON.stringify((f.mock.calls[0][1] as RequestInit).body)).toContain('dropped the ball')
  await waitFor(async () => expect(await db.chunks.count()).toBe(1))
  // fuori dalla selezione, la nuova voce è evidenziata nel testo
  const id = (await db.chunks.toArray())[0].id
  await waitFor(() => expect(document.querySelector('.lyrics a[href$="item=' + id + '"]')?.textContent).toBe('dropped the ball'))
})

test('toccare di nuovo una parola la toglie; Annulla esce senza chiamare', async () => {
  const f = ok()
  mount(f as unknown as typeof fetch)
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a Gemini' }))
  const lyrics = document.querySelector('.lyrics') as HTMLElement
  fireEvent.click(within(lyrics).getByRole('button', { name: 'scramble' }))
  fireEvent.click(within(lyrics).getByRole('button', { name: 'scramble' }))
  const bar = screen.getByRole('region', { name: 'Da chiedere a Gemini' })
  expect((within(bar).getByRole('button', { name: 'Chiedi a Gemini' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(within(bar).getByRole('button', { name: 'Annulla' }))
  expect(screen.queryByRole('region', { name: 'Da chiedere a Gemini' })).toBeNull()
  expect(f).not.toHaveBeenCalled()
})

test('errore di Gemini: lo dice com\'è, e la selezione resta per riprovare', async () => {
  const f = vi.fn().mockResolvedValue(new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 }))
  mount(f as unknown as typeof fetch)
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a Gemini' }))
  fireEvent.click(within(document.querySelector('.lyrics') as HTMLElement).getByRole('button', { name: 'scramble' }))
  const bar = screen.getByRole('region', { name: 'Da chiedere a Gemini' })
  fireEvent.click(within(bar).getByRole('button', { name: 'Chiedi a Gemini' }))
  expect(await screen.findByText(/La chiave Gemini non funziona/)).toBeTruthy()
  expect(bar.textContent).toContain('1 da chiedere')
})
