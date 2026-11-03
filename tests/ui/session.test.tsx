import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { Today } from '../../src/ui/screens/Today'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide, I play it down', 'We wait beside the harbour wall'],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null,
  grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const chunk = (id: string, surface: string, line: number): Chunk => ({
  id, songId: 's1', key: surface, baseForm: surface, surfaceForm: surface, lineIndex: line,
  contexts: [{ songId: 's1', lineIndex: line }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'sig-' + id, explanationIt: 'spiega-' + id, extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const reviewCard = (id: string, itemId: string, kind: 'R' | 'C', due: string): CardRow => {
  const fsrs = { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 2, last_review: new Date('2026-10-20T10:00:00Z'), due: new Date(due) }
  return { id, itemType: 'chunk', itemId, kind, unlocked: 1, due: new Date(due), fsrs, goodRCount: kind === 'C' ? 2 : 0 }
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/session'
  await db.songs.add(song)
})
afterEach(() => {
  cleanup()
  db.close()
})

const deps = () => ({ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now })
const renderSession = () => render(<AppDepsProvider value={deps()}><Session /></AppDepsProvider>)

async function seedCOnly() {
  await db.chunks.add(chunk('c2', 'let it slide', 0))
  await db.cards.add(reviewCard('k2', 'c2', 'C', '2026-10-29T10:00:00Z'))
}

async function typeAndCheck(text: string) {
  const input = (await screen.findByRole('textbox')) as HTMLInputElement
  expect(input.getAttribute('lang')).toBe('en')
  expect(input.getAttribute('autocapitalize')).toBe('off')
  expect(input.getAttribute('spellcheck')).toBe('false')
  fireEvent.input(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
}

test('C card: typo is proposed as Difficile; confirming records rating 2 auto true', async () => {
  await seedCOnly()
  renderSession()
  await typeAndCheck('let it slid')
  await screen.findByText('Quasi: un errore di battitura')
  expect(screen.getByRole('button', { name: 'Difficile' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect(await db.reviews.count()).toBe(1))
  const r = (await db.reviews.toArray())[0]
  expect(r).toMatchObject({ cardId: 'k2', rating: 2, auto: true, answer: 'let it slid' })
})

test('C card whose surfaceForm is not in the verse shows meaning and input only, no verse', async () => {
  await db.chunks.add(chunk('c9', 'let it go', 0))
  await db.cards.add(reviewCard('k9', 'c9', 'C', '2026-10-29T10:00:00Z'))
  const { container } = renderSession()
  await screen.findByRole('textbox')
  expect(screen.getByText('sig-c9')).toBeTruthy()
  expect(container.querySelector('.verse')).toBeNull()
  expect(container.querySelector('.gap')).toBeNull()
  expect(screen.queryByText(/Every night/)).toBeNull()
})

test('C card: changing the proposed rating records auto false', async () => {
  await seedCOnly()
  renderSession()
  await typeAndCheck('let it slid')
  await screen.findByText('Quasi: un errore di battitura')
  fireEvent.click(screen.getByRole('button', { name: 'Bene' }))
  expect(screen.getByRole('button', { name: 'Bene' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect(await db.reviews.count()).toBe(1))
  expect((await db.reviews.toArray())[0]).toMatchObject({ rating: 3, auto: false })
})

test('C card: a wrong answer shows the correct one', async () => {
  await seedCOnly()
  renderSession()
  await typeAndCheck('nothing')
  await screen.findByText(/Risposta attesa: let it slide/)
  expect(screen.getByRole('button', { name: 'Di nuovo' }).getAttribute('aria-pressed')).toBe('true')
})

test('R card: show meaning, then Bene records rating 3 auto false', async () => {
  await db.chunks.add(chunk('c1', 'harbour wall', 1))
  await db.cards.add(reviewCard('k1', 'c1', 'R', '2026-10-30T10:00:00Z'))
  renderSession()
  await screen.findByRole('button', { name: 'Mostra significato' })
  expect(screen.queryByRole('button', { name: 'Bene' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Mostra significato' }))
  await screen.findByText('sig-c1')
  fireEvent.click(screen.getByRole('button', { name: 'Bene' }))
  await waitFor(async () => expect(await db.reviews.count()).toBe(1))
  expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 'k1', rating: 3, auto: false, answer: null })
  await screen.findByText('Fatto per oggi')
  const sess = (await db.sessions.toArray())[0]
  expect(sess.kind).toBe('review')
  expect(sess.reviewsDone).toBe(1)
})

test('empty queue without anything reviewed: nothing to review, not "Fatto per oggi"', async () => {
  renderSession()
  await screen.findByRole('heading', { name: 'Niente da ripassare' })
  expect(screen.queryByText('Fatto per oggi')).toBeNull()
  expect(screen.getByRole('link', { name: 'Torna a Oggi' }).getAttribute('href')).toBe('#/')
})

test('empty queue and no songs: invites to add a song', async () => {
  await db.songs.clear()
  renderSession()
  await screen.findByRole('heading', { name: 'Niente da ripassare' })
  expect(screen.getByRole('link', { name: /Aggiungi una canzone/ }).getAttribute('href')).toBe('#/songs/new')
})

test('Today with no cards and no songs: no session button, invites to add a song', async () => {
  await db.songs.clear()
  render(<AppDepsProvider value={deps()}><Today /></AppDepsProvider>)
  await screen.findByText('in scadenza')
  expect(screen.queryByRole('link', { name: /Inizia sessione/ })).toBeNull()
  expect(screen.getByRole('link', { name: /Aggiungi una canzone/ }).getAttribute('href')).toBe('#/songs/new')
})

test('Today with songs but nothing due: says so, no session button', async () => {
  render(<AppDepsProvider value={deps()}><Today /></AppDepsProvider>)
  await screen.findByText('in scadenza')
  expect(screen.queryByRole('link', { name: /Inizia sessione/ })).toBeNull()
  expect(screen.getByText('Niente da ripassare oggi.')).toBeTruthy()
})

test('pause overlay offers Riprendi and Ferma e salva', async () => {
  await seedCOnly()
  renderSession()
  await screen.findByRole('textbox')
  fireEvent.click(await screen.findByRole('button', { name: /^Timer .*metti in pausa/ }))
  await screen.findByRole('dialog', { name: 'Sessione in pausa' })
  // Il fuoco entra nel dialogo, sull'azione principale.
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Riprendi' })))
  fireEvent.click(screen.getByRole('button', { name: 'Ferma e salva' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  const sess = (await db.sessions.toArray())[0]
  expect(sess.endedAt).not.toBeNull()
})

test('reopening reuses the same open session of the day', async () => {
  await seedCOnly()
  const first = renderSession()
  await screen.findByRole('textbox')
  first.unmount()
  renderSession()
  await screen.findByRole('textbox')
  expect(await db.sessions.count()).toBe(1)
})

test('expired timer: finishing the card opens the sheet with Altri 5 minuti', async () => {
  await seedCOnly()
  await db.chunks.add(chunk('c1', 'harbour wall', 1))
  await db.cards.add(reviewCard('k1', 'c1', 'R', '2026-10-30T10:00:00Z'))
  await db.sessions.add({
    id: 'ss', kind: 'review', songId: null, startedAt: now, endedAt: null,
    timer: { status: 'running', durationMs: 1000, accumulatedMs: 0, resumedAt: Date.now() - 5000 },
    reviewsDone: 0, newDone: 0,
  })
  renderSession()
  await typeAndCheck('let it slide')
  expect(screen.queryByRole('dialog', { name: 'Tempo della sessione finito' })).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await screen.findByRole('dialog', { name: 'Tempo della sessione finito' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Altri 5 minuti' })))
  expect(screen.getByText('1 ripassata')).toBeTruthy()
  expect(screen.getByText('1 resta')).toBeTruthy()
  expect(screen.getByRole('heading', { name: '0 minuti fatti' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Altri 5 minuti' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tempo della sessione finito' })).toBeNull())
  expect((await db.sessions.get('ss'))!.timer.durationMs).toBe(1000 + 300000)
})

test('Today: counts, start link, song progress', async () => {
  await db.chunks.bulkAdd([chunk('c1', 'harbour wall', 1), chunk('c2', 'let it slide', 0)])
  await db.cards.add(reviewCard('k1', 'c1', 'R', '2026-10-30T10:00:00Z'))
  await db.cards.add({ ...reviewCard('k2', 'c2', 'R', '2026-10-30T10:00:00Z'), fsrs: newFsrsCard(now) })
  render(<AppDepsProvider value={deps()}><Today /></AppDepsProvider>)
  await screen.findByText('in scadenza')
  expect(screen.getByRole('link', { name: /Inizia sessione/ }).getAttribute('href')).toBe('#/session')
  expect(screen.getByText(/su 30/)).toBeTruthy()
  const link = await screen.findByRole('link', { name: /Night Song/ })
  expect(link.getAttribute('href')).toBe('#/songs/s1')
  expect(link.textContent).toContain('1 di 2')
  expect(screen.queryByText(/Oggi niente card nuove/)).toBeNull()
})

test('Today: shows the blocked-new note when the review load exceeds the timer', async () => {
  await db.settings.put({ id: 'settings', apiKey: '', model: 'm', theme: 'auto', level: 'B1', bandStart: 2000, bandEnd: 5000, desiredRetention: 0.9, newPerDay: 16, timerMinutes: { study: 15, review: 2 }, persistAsked: false })
  for (let i = 0; i < 11; i++) {
    await db.chunks.add(chunk('x' + i, 'phrase ' + i, 0))
    await db.cards.add(reviewCard('kx' + i, 'x' + i, 'R', '2026-10-30T10:00:00Z'))
  }
  render(<AppDepsProvider value={deps()}><Today /></AppDepsProvider>)
  await screen.findByText('Oggi niente card nuove: ripasso oltre i 2 minuti')
})

test('resuming an open session does not bring back items already reviewed in it (spec §4)', async () => {
  await db.chunks.bulkAdd([chunk('c1', 'let it slide', 0), chunk('c2', 'play it down', 0), chunk('c3', 'wait beside', 1)])
  await db.cards.bulkAdd([
    reviewCard('k1', 'c1', 'R', '2026-10-30T10:00:00Z'),
    reviewCard('k2', 'c2', 'R', '2026-10-30T11:00:00Z'),
    reviewCard('k3', 'c3', 'R', '2026-10-30T12:00:00Z'),
  ])
  const first = renderSession()
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Di nuovo' }))
  await screen.findByText('2 di 3')
  // "Di nuovo" la rimette in scadenza fra pochi minuti: oggi stesso.
  expect((await db.cards.get('k1'))!.due.getTime()).toBeLessThan(new Date('2026-11-01T00:00:00').getTime())
  first.unmount()

  // Riapro l'app: stessa sessione, stesso totale, la card già vista non torna.
  renderSession()
  expect(await screen.findByText('2 di 3')).toBeTruthy()
  expect(screen.queryByText('sig-c1')).toBeNull()
})

test('C answer field really turns off autocorrect and spellcheck in browsers with boolean IDL properties', async () => {
  // Chrome espone autocorrect e spellcheck come proprietà booleane riflesse sull'attributo:
  // una stringa "off"/"false" assegnata alla proprietà diventa true. Qui lo simuliamo.
  const reflect = (name: string, on: string, off: string) =>
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) { return this.getAttribute(name) !== off },
      set(this: HTMLElement, v: unknown) { this.setAttribute(name, v ? on : off) },
    })
  reflect('autocorrect', 'on', 'off')
  reflect('spellcheck', 'true', 'false')
  try {
    await seedCOnly()
    renderSession()
    const input = await screen.findByRole('textbox')
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
  } finally {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).autocorrect
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).spellcheck
  }
})

test('C card: Enter on the keyboard checks the answer, Enter again confirms', async () => {
  await seedCOnly()
  renderSession()
  const input = (await screen.findByRole('textbox')) as HTMLInputElement
  fireEvent.input(input, { target: { value: 'let it slide' } })
  fireEvent.submit(input.form!)
  await screen.findByText('Esatto')
  fireEvent.submit(input.form!)
  await waitFor(async () => expect(await db.reviews.count()).toBe(1))
  expect((await db.reviews.toArray())[0]).toMatchObject({ rating: 3, auto: true, answer: 'let it slide' })
})

test('voto non salvato: avviso, la card resta e si può votare di nuovo', async () => {
  const { errors } = await import('../../src/ui/report')
  errors.dismiss()
  await seedCOnly()
  renderSession()
  await typeAndCheck('let it slid')
  await screen.findByText('Quasi: un errore di battitura')
  const realAdd = db.reviews.add.bind(db.reviews)
  db.reviews.add = (() => Promise.reject(new Error('disk'))) as never
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(() => expect(errors.get()).toMatch(/^Non salvato\./))
  expect(screen.getByRole('button', { name: 'Conferma' })).toBeTruthy()
  db.reviews.add = realAdd as never
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect(await db.reviews.count()).toBe(1))
})

test('caricamento della sessione fallito: non resta in attesa per sempre', async () => {
  const { ErrorBoundary } = await import('../../src/ui/components/ErrorBoundary')
  db.cards.toArray = (() => Promise.reject(new Error('disk'))) as never
  db.cards.where = (() => { throw new Error('disk') }) as never
  render(<AppDepsProvider value={deps()}><ErrorBoundary><Session /></ErrorBoundary></AppDepsProvider>)
  expect(await screen.findByRole('heading', { name: 'Questa pagina si è bloccata' })).toBeTruthy()
})
