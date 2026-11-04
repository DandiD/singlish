import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = { id: 's1', kind: 'song', title: 'Late Train Home', artist: '', spotifyUrl: null, lines: ["I'm gonna get it off my chest"], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [{ lineIndex: 0, written: 'going to', sung: 'gonna', noteIt: '«gonna» sta per going to.' }], addedAt: now, analyzedAt: now }
const chunk: Chunk = { id: 'c1', songId: 's1', key: 'k', baseForm: 'get it off my chest', surfaceForm: 'get it off my chest', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: 'emotions', meaningIt: 'sfogarsi', explanationIt: '', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '"get it off" suona ghe-ri-dof.', userEdited: false, suspended: false }
const spoken: { text: string; rate: number }[] = []
beforeEach(async () => {
  spoken.length = 0
  ;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = class { text: string; rate = 1; lang = ''; constructor(t: string) { this.text = t } }
  ;(window as unknown as Record<string, unknown>).speechSynthesis = { cancel: vi.fn(), speak: (u: { text: string; rate: number }) => spoken.push({ text: u.text, rate: u.rate }) }
  db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/session'
  await db.songs.add(song); await db.chunks.add(chunk)
  await db.cards.add({ id: 'a1', itemType: 'chunk', itemId: 'c1', kind: 'A', unlocked: 1, due: new Date(now.getTime() - 3600000),
    fsrs: { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 3, due: new Date(now.getTime() - 3600000) }, goodRCount: 0 })
})
afterEach(() => { cleanup(); db.close() })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Session /></AppDepsProvider>)

test('card Ascolta: legge il verso, anche più lento; il dettato si controlla e il voto si conferma', async () => {
  mount()
  expect(await screen.findByText('ASCOLTA')).toBeTruthy()
  expect(screen.queryByText("I'm gonna get it off my chest")).toBeNull() // il verso non si vede prima
  fireEvent.click(screen.getByRole('button', { name: 'Riproduci la frase' }))
  expect(spoken).toEqual([{ text: "I'm gonna get it off my chest", rate: 1 }])
  fireEvent.click(screen.getByRole('button', { name: 'Più lenta' }))
  fireEvent.click(screen.getByRole('button', { name: 'Riproduci la frase' }))
  expect(spoken[1].rate).toBeLessThan(1)
  const field = screen.getByLabelText('Dettato') as HTMLInputElement
  expect(field.getAttribute('lang')).toBe('en')
  fireEvent.input(field, { target: { value: 'im gonna get it of my chest' } })
  fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
  expect(await screen.findByText('Quasi: una parola')).toBeTruthy()
  expect(screen.getByText("I'm gonna get it off my chest")).toBeTruthy()
  expect(screen.getByText('"get it off" suona ghe-ri-dof.')).toBeTruthy()
  expect(screen.getByText('«gonna» sta per going to.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'a1', rating: 2, auto: true, answer: 'im gonna get it of my chest' }))
})

test('senza sintesi vocale: lo dice e mostra il verso da leggere', async () => {
  delete (window as unknown as Record<string, unknown>).speechSynthesis
  mount()
  expect(await screen.findByText(/non sa leggere ad alta voce/)).toBeTruthy()
  expect(screen.getByText("I'm gonna get it off my chest")).toBeTruthy()
})

test('card Ascolta: canzone e riga vengono dallo stesso verso', async () => {
  const other: Song = { ...song, id: 's2', lines: ['nothing to hear here', 'we get it off my chest tonight'], connectedSpeech: [] }
  await db.songs.add(other)
  await db.chunks.update('c1', { songId: 's2', lineIndex: 1, contexts: [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 1 }] })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Riproduci la frase' }))
  expect(spoken[0].text).toBe("I'm gonna get it off my chest")
})

test('card Ascolta su un testo libero: niente nota di pronuncia pensata per una canzone', async () => {
  await db.songs.update('s1', { kind: 'text', source: 'serie', connectedSpeech: [] })
  mount()
  delete (window as unknown as Record<string, unknown>).speechSynthesis
  expect(await screen.findByText('ASCOLTA')).toBeTruthy()
  fireEvent.input(screen.getByLabelText('Dettato'), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
  await screen.findByText('Non ancora')
  expect(screen.queryByText('"get it off" suona ghe-ri-dof.')).toBeNull()
})
