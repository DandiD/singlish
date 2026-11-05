import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Today } from '../../src/ui/screens/Today'
import { Songs } from '../../src/ui/screens/Songs'
import { FinalListen } from '../../src/ui/screens/FinalListen'
import { songDetail, songLabel, unlockedText, type SongRow } from '../../src/ui/todayText'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song = (status: Song['status'] = 'studying', lines = ['one', 'two']): Song => ({
  id: 's1', kind: 'song', title: 'Glass Harbour', artist: '', spotifyUrl: null, lines, status, level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: 60, grammarPoint: null, connectedSpeech: [], addedAt: new Date(now.getTime() - 10 * 86400000), analyzedAt: null,
  studyStartedAt: new Date(now.getTime() - 8 * 86400000),
})
const row = (over: Partial<SongRow> = {}): SongRow => ({ song: song(), items: 3, lines: 14, unlocked: 3, toTriage: 0, suspended: 0, ...over })

test('unlockedText: singolare e plurale, il nome segue il totale', () => {
  expect(unlockedText(3, 14)).toBe('3 di 14 versi sbloccati')
  expect(unlockedText(0, 1)).toBe('0 di 1 verso sbloccato')
  expect(unlockedText(1, 1)).toBe('1 di 1 verso sbloccato')
})

test('songDetail: versi sbloccati per le canzoni in studio e completate', () => {
  expect(songDetail(row())).toBe('3 di 14 versi sbloccati')
  expect(songDetail(row({ lines: 1, unlocked: 0 }))).toBe('0 di 1 verso sbloccato')
  expect(songDetail(row({ toTriage: 2 }))).toBe('3 di 14 versi sbloccati · 2 parole da smistare')
  expect(songDetail(row({ song: song('done'), toTriage: 1 }))).toBe('3 di 14 versi sbloccati · 1 parola da smistare')
})

test('songDetail: senza versi restano i rami di prima; «Da studiare» usa le voci', () => {
  expect(songDetail(row({ lines: 0, unlocked: 0, items: 0 }))).toBe('Nessuna voce da ripassare in questa canzone')
  expect(songDetail(row({ lines: 0, unlocked: 0, items: 0, suspended: 1 }))).toBe('Nessuna voce nel ripasso: le trovi sospese nel Lessico')
  expect(songDetail(row({ lines: 0, unlocked: 0, items: 0, toTriage: 2 }))).toBe('2 parole da smistare nello Studio')
  expect(songDetail(row({ song: song('analyzed'), lines: 0, unlocked: 0 }))).toBe('Da studiare · 3 chunk e parole')
})

test('songLabel: «3 di 14 versi», «0 di 1 verso»', () => {
  expect(songLabel(row(), false)).toBe('3 di 14 versi')
  expect(songLabel(row({ lines: 1, unlocked: 0 }), false)).toBe('0 di 1 verso')
  expect(songLabel(row({ lines: 0, unlocked: 0, items: 0 }), false)).toBe('Nessuna voce')
})

let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/' })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)
const chunk = (id: string, lineIndex: number): Chunk => ({ id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex, contexts: [{ songId: 's1', lineIndex }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
const rCard = (itemId: string, state: State): CardRow => ({ id: 'k' + itemId, itemType: 'chunk', itemId, kind: 'R', unlocked: 1, due: now,
  fsrs: { ...newFsrsCard(now), state, due: now, reps: state === State.New ? 0 : 2 }, goodRCount: 0 })
async function seed(status: Song['status'] = 'studying', states: [State, State] = [State.Review, State.New]) {
  await db.songs.add(song(status))
  await db.chunks.bulkAdd([chunk('a', 0), chunk('b', 1)])
  await db.cards.bulkAdd([rCard('a', states[0]), rCard('b', states[1])])
}

test('Oggi: 1 di 2 versi, testo accessibile e anello al 50%', async () => {
  await seed()
  mount(<Today />)
  const card = (await screen.findByRole('heading', { name: 'Glass Harbour' })).closest('a')!
  expect(card.textContent).toContain('1 di 2 versi sbloccati')
  expect(document.querySelector<HTMLElement>('.song-carousel-ring')!.style.getPropertyValue('--p')).toBe('0.5turn')
})

test('Oggi: un «Di nuovo» che riblocca un verso fa scendere il numero', async () => {
  await seed('studying', [State.Review, State.Review])
  const view = mount(<Today />)
  expect((await screen.findByRole('heading', { name: 'Glass Harbour' })).closest('a')!.textContent).toContain('2 di 2 versi sbloccati')
  view.unmount()
  await db.cards.where('itemId').equals('b').modify((c) => { c.fsrs.state = State.Relearning })
  mount(<Today />)
  expect((await screen.findByRole('heading', { name: 'Glass Harbour' })).closest('a')!.textContent).toContain('1 di 2 versi sbloccati')
})

test('Riascolto finale: tre casi', async () => {
  await seed()
  const view = mount(<FinalListen songId="s1" />)
  fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
  expect(screen.getByText('1 di 2 versi sbloccati: gli altri si sbloccano con le prossime sessioni. La canzone passa tra le completate.')).toBeTruthy()
  view.unmount()
  await db.cards.where('itemId').equals('b').modify((c) => { c.fsrs.state = State.Review })
  mount(<FinalListen songId="s1" />)
  fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
  expect(screen.getByText('2 di 2 versi sbloccati. La canzone passa tra le completate.')).toBeTruthy()
})

test('Riascolto finale: senza versi solo la frase finale', async () => {
  await db.songs.add(song())
  mount(<FinalListen songId="s1" />)
  fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
  expect(screen.getByText('La canzone passa tra le completate.')).toBeTruthy()
})

test('Canzoni: nota con i versi sbloccati per studio e completate, non per le altre', async () => {
  await seed()
  const view = mount(<Songs />)
  expect((await screen.findByRole('heading', { name: 'Glass Harbour' })).closest('li')!.textContent).toContain('1 di 2 versi sbloccati')
  view.unmount()
  await db.songs.update('s1', { status: 'analyzed' })
  mount(<Songs />)
  expect((await screen.findByRole('heading', { name: 'Glass Harbour' })).closest('li')!.textContent).not.toContain('versi sbloccati')
})
