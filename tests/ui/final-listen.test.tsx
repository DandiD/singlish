import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { FinalListen } from '../../src/ui/screens/FinalListen'
import { Today } from '../../src/ui/screens/Today'
import { Progress } from '../../src/ui/screens/Progress'
import { parseRoute, href } from '../../src/router'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
const song: Song = {
  id: 's1', kind: 'song', title: 'Glass Harbour', artist: '', spotifyUrl: 'https://open.spotify.com/track/abc123', lines: ['x'], status: 'studying',
  level: 'B1', difficultyKnownPct: 70, comprehensionBefore: 60, grammarPoint: null, connectedSpeech: [], addedAt: daysAgo(10), analyzedAt: daysAgo(10), studyStartedAt: daysAgo(8),
}
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs/s1/final'; await db.songs.add(song) })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('rotta del riascolto', () => {
  expect(parseRoute('#/songs/s1/final')).toEqual({ name: 'finalListen', songId: 's1' })
  expect(href({ name: 'finalListen', songId: 's1' })).toBe('#/songs/s1/final')
})

test('Oggi propone il riascolto della canzone in studio da 7 giorni', async () => {
  mount(<Today />)
  const link = await screen.findByRole('link', { name: /riascolto finale.*Glass Harbour/i })
  expect(link.getAttribute('href')).toBe('#/songs/s1/final')
})

test('si segna la % di adesso, si vede il guadagno, e Chiudi la canzone la completa', async () => {
  mount(<FinalListen songId="s1" />)
  expect(await screen.findByRole('heading', { name: 'Riascolto finale', level: 1 })).toBeTruthy()
  expect(screen.getByRole('link', { name: /Apri in Spotify/ }).getAttribute('href')).toBe(song.spotifyUrl)
  expect((screen.getByRole('button', { name: 'Chiudi la canzone' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.input(screen.getByLabelText('Quanto hai capito adesso?'), { target: { value: '78' } })
  expect(screen.getByText('+18')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi la canzone' }))
  await waitFor(async () => expect(await db.songs.get('s1')).toMatchObject({ comprehensionAfter: 78, status: 'done' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
})

test('Progressi mostra il guadagno medio dopo i riascolti', async () => {
  await db.songs.update('s1', { comprehensionAfter: 78, status: 'done' })
  mount(<Progress />)
  const tile = (await screen.findByText('Guadagno medio')).parentElement!
  expect(tile.textContent).toContain('+18')
})

test('il riepilogo conta chunk e parole della canzone, come Oggi', async () => {
  await db.chunks.add({ id: 'c1', songId: 's1', key: 'k', baseForm: 'let it slide', surfaceForm: 'x', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B1',
    register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
  await db.words.add({ id: 'w1', lemma: 'x', surfaceForm: 'x', pos: 'noun', freqRank: 1, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }], cefr: 'B1',
    register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false })
  mount(<FinalListen songId="s1" />)
  fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
  expect(screen.getByText(/0 di 2 chunk e parole nel ripasso/)).toBeTruthy()
})

test('il riepilogo dice gli stessi numeri di Oggi: quante voci sono già nel ripasso', async () => {
  const { State } = await import('ts-fsrs')
  const { newCardPair } = await import('../../src/domain/scheduler')
  await db.chunks.bulkAdd(['a', 'b'].map((id) => ({ id, songId: 's1', key: id, baseForm: id, surfaceForm: 'x', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom' as const, cefr: 'B1',
    register: 'usable' as const, topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })))
  const [r] = newCardPair('chunk', 'a', now)
  await db.cards.add({ ...r, fsrs: { ...r.fsrs, state: State.Review } })
  await db.cards.add(newCardPair('chunk', 'b', now)[0])
  mount(<FinalListen songId="s1" />)
  fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
  expect(screen.getByText(/1 di 2 chunk e parole nel ripasso/)).toBeTruthy()
})

test('una canzone già completata, aperta dall\'indirizzo: mostra il riascolto fatto e non si richiude', async () => {
  await db.songs.update('s1', { status: 'done', comprehensionAfter: 85, finalListenAt: daysAgo(1) })
  mount(<FinalListen songId="s1" />)
  expect(await screen.findByText(/Riascolto già fatto/)).toBeTruthy()
  expect(screen.getByText(/85%/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Chiudi la canzone' })).toBeNull()
})

test('una canzone non ancora in studio, aperta dall\'indirizzo: niente riascolto finale', async () => {
  await db.songs.update('s1', { status: 'draft' })
  mount(<FinalListen songId="s1" />)
  expect(await screen.findByText(/Il riascolto finale è per le canzoni in studio/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Chiudi la canzone' })).toBeNull()
})

test('una canzone completata senza riascolto, aperta dall\'indirizzo: non dice «Riascolto già fatto»', async () => {
  await db.songs.update('s1', { status: 'done' })
  mount(<FinalListen songId="s1" />)
  expect(await screen.findByText('Canzone già completata')).toBeTruthy()
  expect(screen.queryByText(/Riascolto già fatto/)).toBeNull()
})

test('Oggi intitola la lista come il limite: canzoni e testi aperti', async () => {
  mount(<Today />)
  expect(await screen.findByRole('heading', { name: /^Canzoni e testi aperti/ })).toBeTruthy()
})

test('Oggi: una canzone in studio con solo parole da smistare dice di smistarle, non «0 di 0»', async () => {
  await db.words.add({ id: 'w1', lemma: 'x', surfaceForm: 'x', pos: 'noun', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false })
  mount(<Today />)
  expect(await screen.findByText(/1 parola da smistare nello Studio/)).toBeTruthy()
  expect(screen.queryByText(/0 di 0/)).toBeNull()
})

test('Oggi: una canzone «Da studiare» con solo parole da smistare non dice «0 chunk e parole»', async () => {
  await db.songs.update('s1', { status: 'analyzed' })
  await db.words.add({ id: 'w2', lemma: 'y', surfaceForm: 'y', pos: 'noun', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: 'y', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false })
  mount(<Today />)
  expect(await screen.findByText(/Da studiare · 1 parola da smistare/)).toBeTruthy()
})

test('Oggi: una canzone in studio con tutte le voci sospese non dice «0 di 0»', async () => {
  await db.chunks.add({ id: 'cz', songId: 's1', key: 'x', baseForm: 'x', surfaceForm: 'x', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'x', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: true })
  mount(<Today />)
  expect(await screen.findByText(/Nessuna voce nel ripasso: le trovi sospese nel Lessico/)).toBeTruthy()
  expect(screen.queryByText(/0 di 0/)).toBeNull()
})

test('Oggi: una canzone in studio con voci nel ripasso e parole lasciate da smistare le nomina', async () => {
  await db.chunks.add({ id: 'cy', songId: 's1', key: 'y', baseForm: 'y', surfaceForm: 'y', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'y', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
  await db.words.add({ id: 'w3', lemma: 'z', surfaceForm: 'z', pos: 'noun', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: 'z', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false })
  mount(<Today />)
  expect(await screen.findByText(/0 di 1 chunk e parole nel ripasso · 1 parola da smistare/)).toBeTruthy()
})

test('Oggi: una canzone «Da studiare» senza nessuna voce non dice «0 chunk e parole»', async () => {
  await db.songs.update('s1', { status: 'analyzed' })
  mount(<Today />)
  expect(await screen.findByText(/Da studiare · nessuna voce da ripassare/)).toBeTruthy()
  expect(screen.queryByText(/0 chunk e parole/)).toBeNull()
})

test('Oggi: una canzone «Da studiare» con voci e parole da smistare le nomina tutte e due', async () => {
  await db.songs.update('s1', { status: 'analyzed' })
  await db.chunks.add({ id: 'ca', songId: 's1', key: 'a', baseForm: 'a', surfaceForm: 'a', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'a', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
  await db.words.add({ id: 'wa', lemma: 'b', surfaceForm: 'b', pos: 'noun', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: 'b', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false })
  mount(<Today />)
  expect(await screen.findByText(/Da studiare · 1 chunk e parole · 1 parola da smistare/)).toBeTruthy()
})

test('Riascolto finale: toccare il cursore senza spostarlo conferma la stessa percentuale', async () => {
  mount(<FinalListen songId="s1" />)
  const slider = await screen.findByRole('slider')
  expect((screen.getByRole('button', { name: 'Chiudi la canzone' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.pointerUp(slider)
  const close = screen.getByRole('button', { name: 'Chiudi la canzone' }) as HTMLButtonElement
  expect(close.disabled).toBe(false)
  fireEvent.click(close)
  await waitFor(async () => expect((await db.songs.get('s1'))!.comprehensionAfter).toBe(60))
})

test('Oggi: una canzone completata con parole ancora da smistare compare, con il link allo Studio', async () => {
  await db.songs.update('s1', { status: 'done', comprehensionAfter: 80 })
  await db.words.add({ id: 'wd', lemma: 'd', surfaceForm: 'd', pos: 'noun', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: 'd', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false })
  mount(<Today />)
  const link = await screen.findByRole('link', { name: /Glass Harbour.*Completata.*1 parola da smistare/ })
  expect(link.getAttribute('href')).toBe('#/songs/s1')
})
