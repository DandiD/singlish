import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Lexicon } from '../../src/ui/screens/Lexicon'
import { BottomNav } from '../../src/ui/components/BottomNav'
import { parseRoute, href } from '../../src/router'
import type { Chunk, Song, Word } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = {
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const chunk = (id: string, over: Partial<Chunk> = {}): Chunk => ({
  id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: 'emotions', meaningIt: 'sig ' + id, explanationIt: '', extraExampleEn: '',
  productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const word = (id: string): Word => ({
  id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'money', meaningIt: 'vagare', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false,
})

beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { cleanup(); db.close() })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Lexicon /></AppDepsProvider>)

test('la rotta del Lessico esiste e la barra in basso ci porta', () => {
  expect(parseRoute('#/lexicon')).toEqual({ name: 'lexicon' })
  expect(href({ name: 'lexicon' })).toBe('#/lexicon')
  render(<BottomNav route={{ name: 'lexicon' }} />)
  const link = screen.getByRole('link', { name: /Lessico/ })
  expect(link.getAttribute('href')).toBe('#/lexicon')
  expect(link.getAttribute('aria-current')).toBe('page')
  expect(screen.queryByText('Presto')).toBeNull()
})

test('vuoto: dice da dove arriva il lessico e porta ad aggiungere una canzone', async () => {
  mount()
  expect(await screen.findByText(/Il lessico si riempie/)).toBeTruthy()
  expect(screen.getByRole('link', { name: /Aggiungi una canzone/ }).getAttribute('href')).toBe('#/songs/new')
})

test('voci, conteggi, ricerca, filtri e apertura della scheda', async () => {
  await db.songs.add(song)
  await db.chunks.bulkAdd([chunk('let it slide'), chunk('figure out', { type: 'phrasal_verb', cefr: 'B1', meaningIt: 'capire, risolvere' })])
  await db.words.add(word('wander'))
  mount()
  expect(await screen.findByText('2 chunk · 1 parola')).toBeTruthy()
  const list = screen.getByRole('list', { name: 'Voci del lessico' })
  expect(within(list).getAllByRole('link')).toHaveLength(3)
  const row = within(list).getByRole('link', { name: /let it slide/ })
  expect(row.getAttribute('href')).toBe('#/songs/s1?item=let%20it%20slide')
  expect(row.textContent).toContain('Lantern Road')
  expect(row.textContent).toContain('B2 · nuovo')

  fireEvent.input(screen.getByLabelText('Cerca nel lessico'), { target: { value: 'risolvere' } })
  expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('figure out')])
  fireEvent.input(screen.getByLabelText('Cerca nel lessico'), { target: { value: '' } })

  fireEvent.click(screen.getByRole('button', { name: 'Parole' }))
  expect(screen.getByRole('button', { name: 'Parole' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('wander')])

  fireEvent.click(screen.getByRole('button', { name: 'Tutti' }))
  fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'money' } })
  expect(within(list).getAllByRole('link')).toHaveLength(1)

  fireEvent.change(screen.getByLabelText('Tema'), { target: { value: 'health' } })
  expect(screen.getByText('Nessuna voce con questi filtri.')).toBeTruthy()
})

test('aree scoperte: i temi con meno voci e i più coperti', async () => {
  await db.songs.add(song)
  await db.chunks.bulkAdd([chunk('a'), chunk('b'), chunk('c', { topic: 'work' })])
  mount()
  const box = (await screen.findByText('Aree scoperte')).parentElement!
  expect(box.textContent).toMatch(/Altro 0/)
  expect(box.textContent).toMatch(/Le più coperte: emozioni 2, lavoro 1\./)
})

async function seed() {
  await db.songs.add(song)
  await db.chunks.bulkAdd([chunk('let it slide'), chunk('hold on', { meaningIt: 'aspetta' }), chunk('figure out', { type: 'phrasal_verb', cefr: 'B1', meaningIt: 'capire' })])
  await db.words.add(word('wander'))
}

test('striscia: un pulsante per tipo con conteggio, larghezza proporzionale, niente tipi a 0', async () => {
  await seed()
  mount()
  const strip = await screen.findByRole('group', { name: 'Composizione' })
  const buttons = within(strip).getAllByRole('button')
  expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Phrasal verb: 1', 'Idiomi: 2', 'Parole: 1'])
  expect((screen.getByRole('button', { name: 'Idiomi: 2' }) as HTMLElement).style.flexGrow).toBe('2')
  expect((screen.getByRole('button', { name: 'Parole: 1' }) as HTMLElement).style.flexGrow).toBe('1')
  expect(screen.getByRole('list', { name: 'Legenda dei tipi' }).textContent).toContain('Idiomi 2')
})

test('striscia: toccare un tipo filtra, ritoccare toglie il filtro', async () => {
  await seed()
  mount()
  const list = await screen.findByRole('list', { name: 'Voci del lessico' })
  const idioms = screen.getByRole('button', { name: 'Idiomi: 2' })
  fireEvent.click(idioms)
  expect(idioms.getAttribute('aria-pressed')).toBe('true')
  expect(within(list).getAllByRole('link')).toHaveLength(2)
  fireEvent.click(idioms)
  expect(idioms.getAttribute('aria-pressed')).toBe('false')
  expect(within(list).getAllByRole('link')).toHaveLength(4)
})

test('striscia combinata con ricerca e chip', async () => {
  await seed()
  mount()
  const list = await screen.findByRole('list', { name: 'Voci del lessico' })
  fireEvent.click(screen.getByRole('button', { name: 'Idiomi: 2' }))
  fireEvent.input(screen.getByLabelText('Cerca nel lessico'), { target: { value: 'aspetta' } })
  expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual([expect.stringContaining('hold on')])
  fireEvent.click(screen.getByRole('button', { name: 'B1' }))
  expect(screen.getByText('Nessuna voce con questi filtri.')).toBeTruthy()
})

test('tre tacche per voce, accese secondo lo stato', async () => {
  await seed()
  mount()
  const list = await screen.findByRole('list', { name: 'Voci del lessico' })
  const ticks = (name: RegExp) => {
    const el = within(list).getByRole('link', { name }).querySelector('.lex-ticks')!
    expect(el.getAttribute('aria-hidden')).toBe('true')
    return [...el.children].map((c) => c.classList.contains('on'))
  }
  expect(ticks(/let it slide/)).toEqual([true, false, false]) // nuovo
  await db.chunks.update('hold on', { suspended: true })
  expect(await screen.findByText('B2 · sospeso')).toBeTruthy()
  expect(ticks(/hold on/)).toEqual([false, false, false])
})
