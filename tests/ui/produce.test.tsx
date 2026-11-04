import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { Feedback } from '../../src/ui/screens/Feedback'
import { Today } from '../../src/ui/screens/Today'
import { newFsrsCard } from '../../src/domain/scheduler'
import { pendingProductions, saveProduction } from '../../src/domain/production'
import { saveSettings } from '../../src/domain/settings'
import { parseRoute } from '../../src/router'
import type { Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = { id: 's1', kind: 'song', title: 'Late Train Home', artist: '', spotifyUrl: null, lines: ['I let it slide'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const chunk: Chunk = { id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: 'work', meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '',
  productionPromptIt: 'Dici a un collega che non darai peso a un commento antipatico.', pronunciationNoteIt: '', userEdited: false, suspended: false }
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/session'
  await db.songs.add(song); await db.chunks.add(chunk)
  await db.cards.add({ id: 'p1', itemType: 'chunk', itemId: 'c1', kind: 'P', unlocked: 1, due: new Date(now.getTime() - 3600000),
    fsrs: { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 3, due: new Date(now.getTime() - 3600000) }, goodRCount: 0 })
})
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element, f: typeof fetch = (async () => new Response('')) as unknown as typeof fetch) =>
  render(<AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('card Produci: situazione, espressione da usare, campo in inglese; Salva e avanti la mette da correggere', async () => {
  mount(<Session />)
  expect(await screen.findByText('PRODUCI')).toBeTruthy()
  expect(screen.getByText(chunk.productionPromptIt)).toBeTruthy()
  expect(screen.getByText('let it slide')).toBeTruthy()
  const field = screen.getByLabelText('La tua frase in inglese') as HTMLTextAreaElement
  expect(field.getAttribute('lang')).toBe('en')
  expect(field.getAttribute('spellcheck')).toBe('false')
  expect((screen.getByRole('button', { name: 'Salva e avanti' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.input(field, { target: { value: 'He was rude but I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  await waitFor(async () => expect(await pendingProductions(db)).toHaveLength(1))
  expect(await db.reviews.count()).toBe(0)
  const link = await screen.findByRole('link', { name: 'Correggi la frase con Gemini' })
  expect(link.getAttribute('href')).toBe('#/feedback')
})

test('Non so farla vale Di nuovo, subito', async () => {
  mount(<Session />)
  fireEvent.click(await screen.findByRole('button', { name: 'Non so farla' }))
  await waitFor(async () => expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'p1', rating: 1 }))
  expect(await pendingProductions(db)).toEqual([])
})

test('Le tue frasi: una chiamata, correzione, voto proposto modificabile, Conferma i voti', async () => {
  expect(parseRoute('#/feedback')).toEqual({ name: 'feedback' })
  await saveSettings(db, { apiKey: 'k' })
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'I need to let slide it.', elapsedMs: 9000 })
  const answer = { results: [{ id: 'p1', verdict: 'fix', corrected: 'I need to let it slide.', note_it: "Con «it» l'espressione resta unita: let it slide.", rating: 2 }] }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
  mount(<Feedback />, f as unknown as typeof fetch)
  expect(await screen.findByRole('heading', { name: 'Le tue frasi', level: 1 })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Correggi con Gemini' }))
  expect(await screen.findByText('Da sistemare')).toBeTruthy()
  expect(screen.getByText('I need to let it slide.')).toBeTruthy()
  expect(f).toHaveBeenCalledTimes(1)
  const select = screen.getByLabelText('Voto proposto') as HTMLSelectElement
  expect(select.value).toBe('2')
  fireEvent.change(select, { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferma i voti' }))
  await waitFor(async () => expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'p1', rating: 1 }))
  expect(await pendingProductions(db)).toEqual([])
})

test('Oggi ricorda le frasi da correggere', async () => {
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'x', elapsedMs: 1 })
  mount(<Today />)
  expect((await screen.findByRole('link', { name: /1 frase da correggere/ })).getAttribute('href')).toBe('#/feedback')
})

test('fine sessione: il numero di frasi da correggere è quello di Oggi, anche riprendendo una sessione', async () => {
  // una sessione di oggi lasciata a metà, con due frasi già scritte su un'altra voce
  await db.chunks.add({ ...chunk, id: 'c2', key: 'k2', baseForm: 'run out of' })
  await db.cards.add({ id: 'p2', itemType: 'chunk', itemId: 'c2', kind: 'P', unlocked: 1, due: now, fsrs: { ...newFsrsCard(now), state: State.Review }, goodRCount: 0 })
  await db.sessions.add({ id: 'open', kind: 'review', songId: null, startedAt: new Date(now.getTime() - 60000), endedAt: null,
    timer: { status: 'paused', durationMs: 1800000, accumulatedMs: 1000, resumedAt: null }, reviewsDone: 0, newDone: 0 })
  await saveProduction(db, 'open', { cardId: 'p2', itemId: 'c2', sentence: 'We ran out of time.', elapsedMs: 1 })
  mount(<Session />)
  // la frase già scritta conta come card fatta: questa è la seconda di due
  expect(await screen.findByText('2 di 2')).toBeTruthy()
  fireEvent.input(await screen.findByLabelText('La tua frase in inglese'), { target: { value: 'I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  expect(await screen.findByRole('link', { name: 'Correggi le 2 frasi con Gemini' })).toBeTruthy()
})

test('fine sessione con sole frasi scritte: il riepilogo le conta, come «N di M»', async () => {
  mount(<Session />)
  fireEvent.input(await screen.findByLabelText('La tua frase in inglese'), { target: { value: 'He was rude but I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  expect(await screen.findByText(/0 ripassate · 0 nuove · 1 frase scritta/)).toBeTruthy()
})

test('fine sessione con una frase da correggere: non dice «Fatto per oggi» (dopo la conferma la card può tornare oggi)', async () => {
  mount(<Session />)
  fireEvent.input(await screen.findByLabelText('La tua frase in inglese'), { target: { value: 'He was rude but I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  expect(await screen.findByRole('heading', { name: 'Sessione finita' })).toBeTruthy()
  expect(screen.getByText(/Dopo la correzione le loro card possono tornare in scadenza già oggi/)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Fatto per oggi' })).toBeNull()
})

test('fine sessione con una frase da correggere: «Fatto per oggi» non compare nemmeno per un attimo', async () => {
  const seen = new Set<string>()
  const obs = new MutationObserver(() => document.querySelectorAll('h1').forEach((h) => seen.add(h.textContent ?? '')))
  obs.observe(document.body, { childList: true, subtree: true, characterData: true })
  mount(<Session />)
  fireEvent.input(await screen.findByLabelText('La tua frase in inglese'), { target: { value: 'He was rude but I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  await screen.findByRole('heading', { name: 'Sessione finita' })
  obs.disconnect()
  expect(seen.has('Fatto per oggi')).toBe(false)
})

test('«Correggi» dalla fine della sessione sostituisce la sessione: Indietro non riapre una sessione nuova', async () => {
  mount(<Session />)
  fireEvent.input(await screen.findByLabelText('La tua frase in inglese'), { target: { value: 'He was rude but I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  const link = await screen.findByRole('link', { name: 'Correggi la frase con Gemini' })
  const replace = vi.spyOn(window.history, 'replaceState')
  const push = vi.spyOn(window.history, 'pushState')
  fireEvent.click(link)
  expect(replace).toHaveBeenCalled()
  expect(push).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#/feedback')
  replace.mockRestore(); push.mockRestore()
})
