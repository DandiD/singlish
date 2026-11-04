import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Songs } from '../../src/ui/screens/Songs'
import { getSettings } from '../../src/domain/settings'
import { newCardPair } from '../../src/domain/scheduler'
import type { Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const song: Song = { id: 's1', kind: 'song', title: 'Late Train Home', artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B1',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const chunk = (id: string): Chunk => ({ id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs'; await db.songs.add(song) })
afterEach(() => { cleanup(); db.close() })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Songs /></AppDepsProvider>)

test('pronta: Aggiungi porta dritto ad Aggiungi canzone', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi' }))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/new'))
})

test('non pronta: il foglio spiega perché; Aspetto chiude, Sblocca lo stesso apre Aggiungi canzone', async () => {
  await db.chunks.bulkAdd([chunk('a'), chunk('b')])
  await db.cards.bulkAdd([...newCardPair('chunk', 'a', now), ...newCardPair('chunk', 'b', now)])
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi' }))
  const sheet = await screen.findByRole('dialog', { name: 'La prossima canzone non è ancora pronta' })
  expect(sheet.textContent).toContain('Late Train Home: 2 chunk non ancora nel ripasso')
  expect(sheet.textContent).toMatch(/Canzoni e testi aperti: 1 di 4/)
  fireEvent.click(screen.getByRole('button', { name: 'Aspetto, va bene così' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(window.location.hash).toBe('#/songs')
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Sblocca lo stesso' }))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/new'))
})

test('modalità intensiva: attivarla dal foglio la salva per 7 giorni', async () => {
  await db.chunks.add(chunk('a'))
  await db.cards.bulkAdd(newCardPair('chunk', 'a', now))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /Modalità intensiva/ }))
  await waitFor(async () => expect((await getSettings(db)).intensiveUntil).toEqual(new Date(now.getTime() + 7 * 86400000)))
  expect(State.New).toBe(0)
})

test('Oggi: con la modalità intensiva attiva lo dice', async () => {
  const { Today } = await import('../../src/ui/screens/Today')
  const { saveSettings } = await import('../../src/domain/settings')
  await saveSettings(db, { intensiveUntil: new Date('2026-11-11T10:00:00') })
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Today /></AppDepsProvider>)
  expect(await screen.findByText('Modalità intensiva fino al 11 novembre: fino a 25 nuove al giorno.')).toBeTruthy()
})

test('anche Aggiungi testo passa dal controllo di sblocco', async () => {
  await db.chunks.add(chunk('a'))
  await db.cards.bulkAdd(newCardPair('chunk', 'a', now))
  mount()
  fireEvent.click(await screen.findByRole('link', { name: 'Aggiungi testo' }))
  expect(await screen.findByRole('dialog', { name: 'Il prossimo testo non è ancora pronto' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sblocca lo stesso' }))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/new-text'))
})

test('foglio aperto: se intanto una voce entra nel ripasso, l\'elenco si aggiorna', async () => {
  await db.chunks.bulkAdd([chunk('a'), chunk('b')])
  await db.cards.bulkAdd([...newCardPair('chunk', 'a', now), ...newCardPair('chunk', 'b', now)])
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi' }))
  const sheet = await screen.findByRole('dialog', { name: 'La prossima canzone non è ancora pronta' })
  expect(sheet.textContent).toContain('2 chunk non ancora nel ripasso')
  const r = (await db.cards.where('itemId').equals('a').toArray()).find((c) => c.kind === 'R')!
  await db.cards.update(r.id, { fsrs: { ...r.fsrs, state: 2 } })
  await waitFor(() => expect(sheet.textContent).toContain('1 chunk non ancora nel ripasso'))
})
