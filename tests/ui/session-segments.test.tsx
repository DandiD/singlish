import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { excludeItem } from '../../src/domain/ingest'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide'], status: 'studying', level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const chunk = (n: number): Chunk => ({
  id: 'c' + n, songId: 's1', key: 'k' + n, baseForm: 'k' + n, surfaceForm: 'k' + n, lineIndex: 0,
  contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'sig-' + n, explanationIt: '', extraExampleEn: '', productionPromptIt: 'Situazione ' + n,
  pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const card = (n: number, kind: 'R' | 'P' = 'R'): CardRow => {
  const due = new Date(now.getTime() - n * 60_000)
  return {
    id: 'k' + n, itemType: 'chunk', itemId: 'c' + n, kind, unlocked: 1, due, goodRCount: 0,
    fsrs: { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 2, last_review: new Date('2026-10-20T10:00:00Z'), due },
  }
}
async function seed(n: number, kind: 'R' | 'P' = 'R') {
  for (let i = 1; i <= n; i++) { await db.chunks.add(chunk(i)); await db.cards.add(card(i, kind)) }
}
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/session'
  await db.songs.add(song)
})
afterEach(() => { cleanup(); db.close() })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Session /></AppDepsProvider>)
const kinds = (c: Element) => [...c.querySelectorAll('.session-head .seg')].map((s) => [...s.classList].filter((x) => x !== 'seg').sort().join(' '))
const rateNext = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  fireEvent.click(await screen.findByRole('button', { name }))
}

test('segments replace the bar; N di M stays; current has a ring', async () => {
  await seed(3)
  const { container } = mount()
  await screen.findByText('1 di 3')
  expect(container.querySelector('.bar')).toBeNull()
  expect(kinds(container)).toEqual(['seg-current seg-todo', 'seg-todo', 'seg-todo'])
  expect(container.querySelector('.session-head [role="img"]')!.getAttribute('aria-label')).toBe('Nessun voto finora')
})

test('Bene fills the first segment, Di nuovo leaves the next empty', async () => {
  await seed(3)
  const { container } = mount()
  await rateNext('Bene')
  await screen.findByText('2 di 3')
  expect(kinds(container)).toEqual(['seg-full', 'seg-current seg-todo', 'seg-todo'])
  await rateNext('Di nuovo')
  await screen.findByText('3 di 3')
  expect(kinds(container)).toEqual(['seg-full', 'seg-empty', 'seg-current seg-todo'])
  expect(container.querySelector('.session-head [role="img"]')!.getAttribute('aria-label')).toBe('Voti finora: 1 Bene o Facile, 1 Di nuovo')
})

test('a written sentence gives a dotted segment', async () => {
  await seed(2, 'P')
  const { container } = mount()
  const field = await screen.findByLabelText('La tua frase in inglese')
  fireEvent.input(field, { target: { value: 'I let it slide.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva e avanti' }))
  await screen.findByText('2 di 2')
  expect(kinds(container)).toEqual(['seg-written', 'seg-current seg-todo'])
})

test('resumed session: already done cards are seg-done, current is the next one', async () => {
  await seed(3)
  await db.sessions.add({
    id: 'ss', kind: 'review', songId: null, startedAt: now, endedAt: null,
    timer: { status: 'running', durationMs: 600000, accumulatedMs: 0, resumedAt: Date.now() },
    reviewsDone: 2, newDone: 0,
  })
  const { container } = mount()
  await screen.findByText('3 di 5')
  expect(kinds(container)).toEqual(['seg-done', 'seg-done', 'seg-current seg-todo', 'seg-todo', 'seg-todo'])
})

test('five Bene in a row: the 5th segment glows, once', async () => {
  await seed(6)
  const { container } = mount()
  for (let i = 0; i < 5; i++) await rateNext('Bene')
  await screen.findByText('6 di 6')
  const glow = [...container.querySelectorAll('.session-head .seg')].map((s) => s.classList.contains('seg-glow'))
  expect(glow).toEqual([false, false, false, false, true, false])
})

test('a rating not recorded (item deleted elsewhere) has no outcome: segments stay aligned with the position', async () => {
  await seed(3)
  const { container } = mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  const meaning = (await screen.findByText(/^sig-c?\d$/)).textContent!
  await excludeItem(db, 'c' + meaning.slice(-1))
  fireEvent.click(screen.getByRole('button', { name: 'Bene' }))
  await screen.findByText('2 di 3')
  expect(kinds(container)).toEqual(['seg-done', 'seg-current seg-todo', 'seg-todo'])
  await rateNext('Bene')
  await screen.findByText('3 di 3')
  expect(kinds(container)).toEqual(['seg-done', 'seg-full', 'seg-current seg-todo'])
  expect(container.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Voti finora: 1 Bene o Facile')
})
