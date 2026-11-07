import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { AnswersSheet } from '../../src/ui/screens/AnswersSheet'
import { saveSettings } from '../../src/domain/settings'
import type { AskDraft, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const base: Song = {
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null,
  lines: ['I gave up on you, babe', 'paper lanterns drift', 'quiet rivers hold the moon'],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const fields = { cefr: 'B2', register: 'usable', topic: 'love', explanation_it: 'Smettere di provarci.', extra_example_en: 'Never give up.', production_prompt_it: 'Dì che ti arrendi.' } as const
const item = { item_type: 'chunk', surface_form: 'gave up', widened: false, type: 'phrasal_verb', base_form: 'give up', meaning_it: 'arrendersi', ...fields } as const
const proposal = { type: 'idiom', base_form: 'hold the moon', meaning_it: 'tenere la luna', ...fields } as const
const draft = (over: Partial<AskDraft> = {}, grammar: string | null = 'Past simple.'): AskDraft => ({
  answers: [
    { key: 'w:0:gave up', lineIndex: 0, text: 'gave up', translationIt: 'Ho rinunciato a te', item: { ...item }, verse: null },
    { key: 'v:2', lineIndex: 2, translationIt: 'Fiumi quieti reggono la luna', item: null, verse: { sense_it: 'Immagine di quiete.', grammar_it: grammar, culture_it: 'Luna e fiumi.', proposals: [{ ...proposal }] } },
  ],
  unanswered: [],
  ...over,
})
const online = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
const f = vi.fn()
beforeEach(async () => {
  online(true); f.mockReset()
  db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1'
  await saveSettings(db, { apiKey: 'k' })
})
afterEach(() => { cleanup(); db.close() })
const open = async (askDraft: AskDraft | undefined, fetchFn: unknown = f) => {
  await db.songs.add({ ...base, askDraft, lineNotes: [{ lineIndex: 1, senseIt: 'nota', grammarIt: null, cultureIt: null }] })
  render(<AppDepsProvider value={{ db, fetch: fetchFn as typeof fetch, sleep: async () => {}, now: () => now }}><Study songId="s1" itemId="ask" /></AppDepsProvider>)
  return screen.findByRole('dialog')
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

test('item spuntato, proposta no; spuntare la proposta porta le card a 4', async () => {
  await open(draft())
  expect((screen.getByLabelText('gave up') as HTMLInputElement).checked).toBe(true)
  const p = screen.getByLabelText(/hold the moon/) as HTMLInputElement
  expect(p.checked).toBe(false)
  expect(btn('Aggiungi 2 card al ripasso')).toBeTruthy()
  fireEvent.click(p)
  expect(btn('Aggiungi 4 card al ripasso')).toBeTruthy()
})

test('verso senza grammatica: Senso e Cultura sì, Grammatica no; traduzione visibile', async () => {
  await open(draft({}, null))
  expect(screen.getByText('Senso')).toBeTruthy()
  expect(screen.getByText('Cultura')).toBeTruthy()
  expect(screen.queryByText('Grammatica')).toBeNull()
  expect(screen.getByText('Fiumi quieti reggono la luna')).toBeTruthy()
})

test('Aggiungi crea il chunk e toglie la bozza', async () => {
  await open(draft())
  fireEvent.click(btn('Aggiungi 2 card al ripasso'))
  await waitFor(async () => expect((await db.songs.get('s1'))!.askDraft).toBeUndefined())
  expect(await db.chunks.count()).toBe(1)
})

test('Chiudi senza aggiungere: nessun chunk, bozza tolta, note intatte', async () => {
  await open(draft())
  fireEvent.click(btn('Chiudi senza aggiungere'))
  await waitFor(async () => expect((await db.songs.get('s1'))!.askDraft).toBeUndefined())
  expect(await db.chunks.count()).toBe(0)
  expect((await db.songs.get('s1'))!.lineNotes).toHaveLength(1)
})

test('Esc chiude il foglio, la bozza resta e Studio la segnala', async () => {
  await open(draft())
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(document.querySelector('.sheet-scrim.closing')).toBeTruthy())
  expect((await db.songs.get('s1'))!.askDraft).toBeTruthy()
  const link = await screen.findByRole('link', { name: 'Rivedi' })
  expect(screen.getByText('Hai risposte da rivedere')).toBeTruthy()
  expect(link.getAttribute('href')).toContain('item=ask')
})

test('senza voci spuntate il piede è Chiudi', async () => {
  await open(draft({ answers: [draft().answers[1]] }))
  expect(screen.queryByRole('button', { name: /Aggiungi/ })).toBeNull()
  expect(document.querySelector('.ex-foot')!.textContent).toContain('Chiudi')
  expect(screen.getAllByRole('button', { name: 'Chiudi' })).toHaveLength(2) // X e piede
})

test('Riprova: offline disabilitato; online una sola chiamata anche con secondo click', async () => {
  const unanswered = [{ id: 'w1', lineIndex: 1, text: 'drift' }]
  online(false)
  f.mockReturnValue(new Promise(() => {}))
  await open(draft({ unanswered }))
  expect(screen.getByText('Gemini non ha risposto su questo')).toBeTruthy()
  expect(btn('Riprova').disabled).toBe(true)
  online(true)
  window.dispatchEvent(new Event('online'))
  await waitFor(() => expect(btn('Riprova').disabled).toBe(false))
  fireEvent.click(btn('Riprova'))
  fireEvent.click(btn('Riprova'))
  await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
  expect(f).toHaveBeenCalledTimes(1)
})

test('Chiudi con n = 0: le voci spuntate già nel lessico ricevono il verso e la bozza si toglie', async () => {
  await db.chunks.add({
    id: 'c1', songId: 'other', key: 'give up', baseForm: 'give up', surfaceForm: 'give up', lineIndex: 1,
    contexts: [{ songId: 'other', lineIndex: 1 }], type: 'phrasal_verb', cefr: 'B2', register: 'usable', topic: 'love',
    meaningIt: 'arrendersi', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false,
  })
  await open(draft({ answers: [draft().answers[0]] }))
  expect(screen.getByText('Già nel tuo lessico')).toBeTruthy()
  fireEvent.click(document.querySelector('.ex-foot button') as HTMLButtonElement)
  await waitFor(async () => expect((await db.songs.get('s1'))!.askDraft).toBeUndefined())
  const c = (await db.chunks.get('c1'))!
  expect(c.contexts.some((x) => x.songId === 's1' && x.lineIndex === 0)).toBe(true)
})

test('se il foglio si monta prima che la bozza arrivi nel dato vivo, aspetta invece di chiudersi', async () => {
  const withDraft = { ...base, askDraft: draft() }
  await db.songs.add(withDraft)
  const tree = (song: Song) => <AppDepsProvider value={{ db, fetch: f as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><AnswersSheet song={song} /></AppDepsProvider>
  window.location.hash = '#/songs/s1?item=ask'
  const view = render(tree(base))
  await new Promise((r) => setTimeout(r, 50))
  view.rerender(tree(withDraft))
  const sheet = await screen.findByRole('dialog')
  expect(sheet.parentElement!.classList.contains('closing')).toBe(false)
  await new Promise((r) => setTimeout(r, 300))
  expect(window.location.hash).toBe('#/songs/s1?item=ask')
})
