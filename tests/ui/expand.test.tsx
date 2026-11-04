import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Expand } from '../../src/ui/screens/Expand'
import { Study } from '../../src/ui/screens/Study'
import { Session } from '../../src/ui/screens/Session'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import { parseRoute } from '../../src/router'
import type { Song, Word } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = { id: 's1', kind: 'song', title: 'Running On Empty', artist: '', spotifyUrl: null, lines: ['running on empty'], status: 'studying', level: 'B1',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const word: Word = { id: 'w1', lemma: 'empty', surfaceForm: 'empty', pos: 'adjective', freqRank: 2000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'vuoto', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false }
const expansion = {
  family: [{ lemma: 'emptiness', pos: 'noun', meaning_it: 'vuoto, senso di vuoto', example_en: 'A feeling of emptiness.' }],
  collocations: [{ base_form: 'empty promises', meaning_it: 'promesse vuote', example_en: 'No more empty promises.' }],
  opposites: [{ lemma: 'full', pos: 'adjective', meaning_it: 'pieno', example_en: 'The bus was full.' }],
  nuance: { options: ['empty', 'vacant', 'hollow'], answer: 'vacant', situation_it: "Scrivi un annuncio: l'appartamento è libero da subito.",
    sentence_en: 'The flat is ____ from today.', explanation_it: 'Vacant è il termine da annunci: libero, non occupato.', summary_it: 'libero, vuoto dentro: quando usare quale' },
}
const reply = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expansion) }] } }] })))
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/expand/w1'
  await saveSettings(db, { apiKey: 'k' }); await db.songs.add(song); await db.words.add(word); await db.cards.bulkAdd(newCardPair('word', 'w1', now))
})
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element, f: typeof fetch = (async () => new Response('')) as unknown as typeof fetch) =>
  render(<AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('dalla scheda di una parola si arriva a Espandi', async () => {
  expect(parseRoute('#/expand/w1')).toEqual({ name: 'expand', wordId: 'w1' })
  window.location.hash = '#/songs/s1?item=w1'
  mount(<Study songId="s1" itemId="w1" />)
  await screen.findByRole('dialog')
  expect(screen.getByRole('link', { name: 'Espandi' }).getAttribute('href')).toBe('#/expand/w1')
})

test('una chiamata a richiesta, gruppi con caselle, Aggiungi al ripasso', async () => {
  const f = reply()
  mount(<Expand wordId="w1" />, f as unknown as typeof fetch)
  expect(await screen.findByRole('heading', { name: 'Espandi «empty»', level: 1 })).toBeTruthy()
  expect(f).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Chiedi a Gemini' }))
  expect(await screen.findByText('FAMIGLIA')).toBeTruthy()
  expect(screen.getByText('SFUMATURE')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: /full/ }))
  // emptiness e full: 2 card ciascuna; empty promises: 2; sfumature: 1
  expect(screen.getByText('7 card nuove · entrano dopo i chunk delle canzoni')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi 7 card al ripasso' }))
  await waitFor(async () => expect((await db.words.toArray()).map((w) => w.lemma).sort()).toEqual(['emptiness', 'empty', 'full']))
  expect(f).toHaveBeenCalledTimes(1)
})

test('card Sfumature: si sceglie, si vede la spiegazione, si vota', async () => {
  await db.words.update('w1', { nuance: expansion.nuance })
  await db.cards.add({ id: 's-1', itemType: 'word', itemId: 'w1', kind: 'S', unlocked: 1, due: new Date(now.getTime() - 3600000),
    fsrs: { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 3, due: new Date(now.getTime() - 3600000) }, goodRCount: 0 })
  await db.cards.where('itemId').equals('w1').filter((c) => c.kind !== 'S').delete()
  window.location.hash = '#/session'
  mount(<Session />)
  expect(await screen.findByText('SFUMATURE')).toBeTruthy()
  expect(screen.getByText("Scrivi un annuncio: l'appartamento è libero da subito.")).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'hollow' }))
  expect(await screen.findByText('Non è hollow: è vacant')).toBeTruthy()
  expect(screen.getByText('Vacant è il termine da annunci: libero, non occupato.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Di nuovo' }))
  await waitFor(async () => expect((await db.reviews.toArray())[0]).toMatchObject({ cardId: 's-1', rating: 1, answer: 'hollow' }))
})

test('Espandi si offre solo per le parole in studio, non da smistare né nate da Espandi', async () => {
  window.location.hash = '#/songs/s1?item=w1'
  await db.words.update('w1', { triage: 'pending' })
  const { unmount } = mount(<Study songId="s1" itemId="w1" />)
  await screen.findByRole('dialog')
  expect(screen.queryByRole('link', { name: 'Espandi' })).toBeNull()
  unmount()
  await db.words.update('w1', { triage: 'learn', origin: 'expand', fromItemId: 'x' })
  mount(<Study songId="s1" itemId="w1" />)
  await screen.findByRole('dialog')
  expect(screen.queryByRole('link', { name: 'Espandi' })).toBeNull()
})

test('Espandi aperto dall\'indirizzo su una parola sospesa: lo dice e non chiama Gemini', async () => {
  await db.words.update('w1', { suspended: true })
  const f = reply()
  mount(<Expand wordId="w1" />, f as unknown as typeof fetch)
  expect(await screen.findByText(/Questa parola non si può espandere/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Chiedi a Gemini/ })).toBeNull()
  expect(f).not.toHaveBeenCalled()
})

test('scheda aperta dall\'indirizzo su una canzone dove la voce non compare: nessun verso preso da un\'altra canzone', async () => {
  await db.songs.add({ ...song, id: 's2', title: 'Other Song', lines: ['a line without the word'] })
  window.location.hash = '#/songs/s2?item=w1'
  mount(<Study songId="s2" itemId="w1" />)
  await screen.findByRole('dialog')
  expect(screen.queryByText(/NELLA CANZONE/)).toBeNull()
  expect(screen.queryByText('a line without the word', { selector: '.examples *' })).toBeNull()
})
