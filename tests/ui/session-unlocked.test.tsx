import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { newCardPair, recordReview } from '../../src/domain/scheduler'
import { startTimer } from '../../src/domain/timer'
import type { Chunk, Song } from '../../src/db/types'

let db: SinglishDB
let now = new Date('2026-10-31T10:00:00Z')
const T0 = new Date('2026-10-01T10:00:00Z')

const mkSong = (lines: number, over: Partial<Song> = {}): Song => ({
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: Array.from({ length: lines }, (_, i) => `invented verse number ${i}`),
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null,
  grammarPoint: null, connectedSpeech: [], addedAt: T0, analyzedAt: T0,
  lineTranslations: Array.from({ length: lines }, (_, i) => ({ lineIndex: i, textIt: `verso inventato ${i}` })),
  ...over,
})
const mkChunk = (id: string, line: number): Chunk => ({
  id, songId: 's1', key: id, baseForm: `verse number ${line}`, surfaceForm: `verse number ${line}`, lineIndex: line,
  contexts: [{ songId: 's1', lineIndex: line }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'sig-' + id, explanationIt: '', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const inp = (rating: 1 | 3) => ({ rating, auto: false, answer: null, elapsedMs: 1 })

/** Porta la card R a Review; con `relearn` un «Di nuovo» la rimette in Relearning. Ritorna la scadenza. */
async function seedItem(id: string, line: number, relearn: boolean): Promise<Date> {
  await db.chunks.add(mkChunk(id, line))
  const [r, c] = newCardPair('chunk', id, T0)
  await db.cards.bulkAdd([r, { ...c, due: new Date('2027-01-01') }]) // solo la card R entra in sessione
  let t = T0
  let card = await recordReview(db, r.id, inp(3), t, 0.9)
  for (let i = 0; i < 10 && card.fsrs.state !== State.Review; i++) {
    t = new Date(card.due.getTime() + 60_000)
    card = await recordReview(db, r.id, inp(3), t, 0.9)
  }
  if (!relearn) return card.due
  t = new Date(card.due.getTime() + 60_000)
  card = await recordReview(db, r.id, inp(1), t, 0.9)
  expect(card.fsrs.state).toBe(State.Relearning)
  return card.due
}

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/session'
})
afterEach(() => {
  cleanup()
  db.close()
})

const deps = () => ({ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now })
const renderSession = () => render(<AppDepsProvider value={deps()}><Session /></AppDepsProvider>)

async function rate(label: 'Bene' | 'Di nuovo') {
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  fireEvent.click(await screen.findByRole('button', { name: label }))
}
async function setNow(due: Date) { now = new Date(due.getTime() + 60_000) }

test('a card going back to Review unlocks its verse: the end lists it with translation', async () => {
  await db.songs.add(mkSong(2))
  await setNow(await seedItem('c0', 0, true))
  renderSession()
  await rate('Bene')
  await screen.findByRole('heading', { name: 'Oggi hai sbloccato 1 verso' })
  const list = screen.getByRole('list', { name: 'Versi sbloccati' })
  expect(list.textContent).toContain('Night Song')
  expect(list.textContent).toContain('invented verse number 0')
  expect(list.textContent).toContain('verso inventato 0')
  expect(list.querySelector('[lang="en"]')).toBeTruthy()
  expect(screen.getByText('1 ripassata · 0 nuove')).toBeTruthy()
})

test('a verse unlocked before the session is not listed as new', async () => {
  await db.songs.add(mkSong(2))
  await seedItem('c1', 1, false)
  await setNow(await seedItem('c0', 0, true))
  // c1 resta sbloccata ma non è in scadenza: la sessione ha solo c0
  await db.cards.where('itemId').equals('c1').modify({ due: new Date('2027-01-01'), unlocked: 0 })
  renderSession()
  await rate('Bene')
  await screen.findByRole('heading', { name: 'Oggi hai sbloccato 1 verso' })
  const list = screen.getByRole('list', { name: 'Versi sbloccati' })
  expect(list.textContent).toContain('invented verse number 0')
  expect(list.textContent).not.toContain('invented verse number 1')
})

test('seven verses unlocked: six rows and "e un altro verso"', async () => {
  await db.songs.add(mkSong(7))
  let due = T0
  for (let i = 0; i < 7; i++) due = await seedItem('c' + i, i, true)
  await setNow(due)
  renderSession()
  for (let i = 0; i < 7; i++) await rate('Bene')
  await screen.findByRole('heading', { name: 'Oggi hai sbloccato 7 versi' })
  expect(screen.getByRole('list', { name: 'Versi sbloccati' }).querySelectorAll('li')).toHaveLength(6)
  expect(screen.getByText('e un altro verso')).toBeTruthy()
})

test('resumed session without unlockedAtStart: only the strongest items, never a false list', async () => {
  await db.songs.add(mkSong(2))
  // card già in Review e in scadenza: «Bene» fa crescere la stabilità
  const due = await seedItem('c0', 0, false)
  await setNow(due)
  await db.sessions.add({
    id: 'old', kind: 'review', songId: null, startedAt: now, endedAt: null,
    timer: startTimer(600_000, Date.now()),
    reviewsDone: 0, newDone: 0,
  })
  renderSession()
  await rate('Bene')
  await screen.findByRole('heading', { name: 'Le voci più forti di oggi' })
  expect(screen.queryByText(/Oggi hai sbloccato/)).toBeNull()
  expect(screen.getByText('verse number 0')).toBeTruthy()
  expect(screen.getByText('sig-c0')).toBeTruthy()
})

test('only "Di nuovo": no unlocked section at all', async () => {
  await db.songs.add(mkSong(2))
  await setNow(await seedItem('c0', 0, true))
  renderSession()
  await rate('Di nuovo')
  await screen.findByText(/ripassata/)
  await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: /Sessione finita|Fatto per oggi/ })).toBeTruthy())
  await new Promise((r) => setTimeout(r, 100))
  expect(screen.queryByText(/Oggi hai sbloccato/)).toBeNull()
  expect(screen.queryByText('Le voci più forti di oggi')).toBeNull()
})

test('a new session saves unlockedAtStart', async () => {
  await db.songs.add(mkSong(2))
  await seedItem('c1', 1, false)
  await setNow(await seedItem('c0', 0, true))
  renderSession()
  await screen.findByRole('button', { name: 'Mostra significato' })
  const sess = (await db.sessions.toArray())[0]
  expect(sess.unlockedAtStart).toEqual(['s1:1'])
})
