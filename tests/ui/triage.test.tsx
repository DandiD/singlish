import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Triage } from '../../src/ui/screens/Triage'
import { Study } from '../../src/ui/screens/Study'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { Chunk, Song, Word } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: 'https://open.spotify.com/track/x',
  lines: ['I will let it slide tonight', 'Waiting by the harbour'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null,
  grammarPoint: { title: 'Present simple', explanationIt: 'Abitudini.', lineIndex: 0 }, connectedSpeech: [],
  addedAt: now, analyzedAt: now,
}
const word = (id: string, lemma: string, rank: number, line: number): Word => ({
  id, lemma, surfaceForm: lemma, pos: 'noun', freqRank: rank, songId: 's1', lineIndex: line,
  contexts: [{ songId: 's1', lineIndex: line }], cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'sig-' + lemma, explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false,
})
const chunk: Chunk = {
  id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
  contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'lasciar correre', explanationIt: 'Non reagire.', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false,
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = ''
  await db.songs.add(song)
  await db.words.bulkAdd([word('w1', 'harbour', 6903, 1), word('w2', 'weary', 8451, 1)])
  await db.chunks.add(chunk)
})
afterEach(() => {
  cleanup()
  db.close()
})

const deps = () => ({ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now })

test('triage: La so on the first word, confirm -> 1 known, 2 cards for the second', async () => {
  render(<AppDepsProvider value={deps()}><Triage songId="s1" /></AppDepsProvider>)
  await screen.findByText('harbour')
  const group = screen.getByRole('radiogroup', { name: 'harbour' })
  fireEvent.click(group.querySelector('[role="radio"]:first-child')!)
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(() => expect(window.location.hash).toBe('#/songs/s1'))
  expect((await db.words.get('w1'))!.triage).toBe('known')
  expect((await db.words.get('w2'))!.triage).toBe('learn')
  expect(await db.cards.where('itemId').equals('w2').count()).toBe(2)
  expect(await db.cards.where('itemId').equals('w1').count()).toBe(0)
})

test('study: renders highlighted lines and the pending banner', async () => {
  render(<AppDepsProvider value={deps()}><Study songId="s1" /></AppDepsProvider>)
  const mark = await screen.findByRole('link', { name: 'let it slide' })
  expect(mark.className).toContain('id')
  expect(mark.getAttribute('href')).toBe('#/songs/s1?item=c1')
  expect(await screen.findByText(/2 parole nuove da smistare/)).toBeTruthy()
  expect(screen.getByRole('link', { name: /Apri in Spotify/ }).getAttribute('target')).toBe('_blank')
})

test('item sheet: edit saves userEdited, suspend, exclude with confirm deletes chunk and cards', async () => {
  await db.cards.add({ id: 'k1', itemType: 'chunk', itemId: 'c1', kind: 'R', unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
  window.location.hash = '#/songs/s1?item=c1'
  render(<AppDepsProvider value={deps()}><Study songId="s1" itemId="c1" /></AppDepsProvider>)
  await screen.findByRole('dialog', { name: 'Scheda del chunk' })
  fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
  fireEvent.input(screen.getByLabelText('Significato'), { target: { value: 'lasciar stare' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
  await waitFor(async () => expect((await db.chunks.get('c1'))!.meaningIt).toBe('lasciar stare'))
  expect((await db.chunks.get('c1'))!.userEdited).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Sospendi' }))
  await waitFor(async () => expect((await db.chunks.get('c1'))!.suspended).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: 'Escludi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sì, escludi' }))
  await waitFor(async () => expect(await db.chunks.get('c1')).toBeUndefined())
  expect(await db.cards.where('itemId').equals('c1').count()).toBe(0)
})

test('smistamento non salvato: avviso chiaro e Conferma di nuovo usabile', async () => {
  const { errors } = await import('../../src/ui/report')
  errors.dismiss()
  render(<AppDepsProvider value={deps()}><Triage songId="s1" /></AppDepsProvider>)
  await screen.findByText('harbour')
  db.words.bulkPut = (() => Promise.reject(new Error('disk'))) as never
  db.cards.bulkAdd = (() => Promise.reject(new Error('disk'))) as never
  db.words.update = (() => Promise.reject(new Error('disk'))) as never
  fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
  await waitFor(() => expect(errors.get()).toMatch(/^Non salvato\. Riprova/))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Conferma' }) as HTMLButtonElement).disabled).toBe(false))
  expect(window.location.hash).toBe('')
})

test('modifica della scheda non salvata: resta in modifica e lo dice', async () => {
  const { errors } = await import('../../src/ui/report')
  errors.dismiss()
  window.location.hash = '#/songs/s1?item=c1'
  render(<AppDepsProvider value={deps()}><Study songId="s1" itemId="c1" /></AppDepsProvider>)
  await screen.findByRole('dialog', { name: 'Scheda del chunk' })
  fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
  db.chunks.update = (() => Promise.reject(new Error('disk'))) as never
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
  await waitFor(() => expect(errors.get()).toMatch(/^Non salvato\./))
  expect(screen.getByLabelText('Significato')).toBeTruthy()
})
