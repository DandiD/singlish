import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Progress } from '../../src/ui/screens/Progress'
import { Today } from '../../src/ui/screens/Today'
import { parseRoute, href } from '../../src/router'
import { State } from 'ts-fsrs'
import { newFsrsCard } from '../../src/domain/scheduler'
import { saveSettings } from '../../src/domain/settings'
import type { CardRow, Chunk, Review, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const song = (id: string, day: number, before: number | null): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: before, grammarPoint: null, connectedSpeech: [], addedAt: new Date(now.getTime() - day * 86400000), analyzedAt: null,
})
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta e collegamento da Oggi', async () => {
  expect(parseRoute('#/progress')).toEqual({ name: 'progress' })
  expect(href({ name: 'progress' })).toBe('#/progress')
  mount(<Today />)
  expect((await screen.findByRole('link', { name: 'Diario' })).getAttribute('href')).toBe('#/progress')
})

test('comprensione: grafico con i valori leggibili anche senza vederlo, e il valore attuale', async () => {
  await db.songs.bulkAdd([song('Prima', 20, 40), song('Seconda', 10, 55), song('Terza', 2, 62)])
  mount(<Progress />)
  expect(await screen.findByRole('heading', { name: 'Diario', level: 1 })).toBeTruthy()
  const chart = screen.getByRole('img', { name: /Comprensione al primo ascolto per canzone: 40, 55, 62 per cento/ })
  expect(chart.querySelectorAll('circle')).toHaveLength(3)
  expect(screen.getByText('62%', { selector: '.big-num' })).toBeTruthy()
  const table = screen.getByRole('table', { name: 'Comprensione per canzone' })
  expect(table.textContent).toContain('Seconda')
  expect(table.textContent).toContain('55%')
})

test('senza dati: niente numeri inventati, e cosa fare', async () => {
  mount(<Progress />)
  expect(await screen.findByText(/Segna quanto capisci al primo ascolto/)).toBeTruthy()
  expect(screen.getByText('Memoria reale').parentElement!.textContent).toContain('—')
  expect(screen.queryByRole('img', { name: /Comprensione/ })).toBeNull()
})

const review = (id: string, at: Date): Review => ({ id, cardId: 'k', rating: 3, auto: false, answer: null, elapsedMs: 1000, reviewedAt: at, wasNew: false })
const reviewsOn = (day: string, n: number) => Array.from({ length: n }, (_, i) => review(`${day}-${i}`, new Date(`${day}T09:00:00`)))

test('Diario: calendario prima della comprensione, 84 celle meno i giorni futuri', async () => {
  mount(<Progress />)
  const cal = await screen.findByRole('img', { name: /Ultime 12 settimane: 0 giorni con ripassi/ })
  const heading = screen.getByRole('heading', { name: 'Comprensione al primo ascolto' })
  expect(cal.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // 2026-11-04 è un mercoledì: giovedì, venerdì, sabato e domenica non si disegnano.
  expect(cal.querySelectorAll('.cal-cell')).toHaveLength(80)
})

test('calendario: 30 ripassi sono il livello 3; la tabella dice il giorno libero', async () => {
  await db.reviews.bulkAdd([...reviewsOn('2026-11-03', 30), ...reviewsOn('2026-11-02', 2)])
  await saveSettings(db, { freeDays: ['2026-10-30'] })
  mount(<Progress />)
  const cal = await screen.findByRole('img', { name: /Ultime 12 settimane: 2 giorni con ripassi/ })
  expect(cal.querySelector('[data-day="2026-11-03"]')!.getAttribute('data-level')).toBe('3')
  expect(cal.querySelector('[data-day="2026-11-02"]')!.getAttribute('data-level')).toBe('1')
  const table = screen.getByRole('table', { name: 'Ripassi per giorno' })
  const row = [...table.querySelectorAll('tr')].find((r) => r.textContent!.includes('giorno libero'))!
  expect(row.textContent).toContain('30')
  expect(cal.querySelector('[data-day="2026-10-30"]')!.getAttribute('data-free')).toBe('true')
})

const lineSong = (id: string, addedDay: number): Song => ({ ...song(id, addedDay, null), lines: ['a line', 'b line', 'c line'] })
const chunkAt = (id: string, songId: string, lineIndex: number): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex, contexts: [{ songId, lineIndex }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '', extraExampleEn: '',
  productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const rCard = (id: string, itemId: string, state: State): CardRow => ({
  id, itemType: 'chunk', itemId, kind: 'R', unlocked: 1, due: now,
  fsrs: { ...newFsrsCard(now), state, due: now, reps: state === State.New ? 0 : 2, stability: 3, difficulty: 5 }, goodRCount: 0,
})

test('Versi sbloccati: il totale è la somma dei «N di M» di Oggi', async () => {
  await db.songs.bulkAdd([lineSong('Alfa', 5), lineSong('Beta', 3)])
  await db.chunks.bulkAdd([chunkAt('a0', 'Alfa', 0), chunkAt('a1', 'Alfa', 1), chunkAt('b0', 'Beta', 0), chunkAt('b1', 'Beta', 1), chunkAt('b2', 'Beta', 2)])
  await db.cards.bulkAdd([
    rCard('ca0', 'a0', State.Review), rCard('ca1', 'a1', State.New),
    rCard('cb0', 'b0', State.Review), rCard('cb1', 'b1', State.Review), rCard('cb2', 'b2', State.Review),
  ])
  mount(<Today />)
  await screen.findByText(/Alfa/, { selector: '*' }).catch(() => {})
  await waitFor(() => expect(document.querySelectorAll('.visually-hidden').length).toBeGreaterThan(0))
  const nums = [...document.querySelectorAll('.visually-hidden')].map((e) => /(\d+) di \d+ versi/.exec(e.textContent ?? '')).filter((m) => !!m).map((m) => Number(m![1]))
  expect(nums).toHaveLength(2)
  const sum = nums.reduce((x, y) => x + y, 0)
  expect(sum).toBe(4)
  cleanup()
  mount(<Progress />)
  const tile = (await screen.findByText('Versi sbloccati')).parentElement!
  expect(tile.querySelector('.tile-num')!.textContent).toBe(String(sum))
})

test('Versi sbloccati senza dati: trattino e cosa fare', async () => {
  mount(<Progress />)
  const tile = (await screen.findByText('Versi sbloccati')).parentElement!
  expect(tile.querySelector('.tile-num')!.textContent).toBe('—')
  expect(tile.textContent).toContain('Ripassa le card di una canzone: i versi capiti si contano qui.')
})
