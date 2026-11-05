import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Today } from '../../src/ui/screens/Today'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import { saveSettings } from '../../src/domain/settings'
import { LIMIT_NOTE } from '../../src/domain/ingest'
import type { CardRow, Chunk, Review, Song, Word } from '../../src/db/types'

// Titoli e versi inventati.
let db: SinglishDB
const now = new Date(2026, 10, 5, 10, 0)
const at = (days: number, h = 10) => new Date(2026, 10, 5 + days, h, 0)

const song = (id: string, title: string, status: Song['status'], over: Partial<Song> = {}): Song => ({
  id, kind: 'song', title, artist: '', spotifyUrl: null, lines: ['we sail the paper sea', 'under a borrowed moon'], status,
  level: 'B1', difficultyKnownPct: 70, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
  addedAt: at(-3), analyzedAt: at(-3), studyStartedAt: at(-2), ...over,
})
const chunk = (id: string, songId = 's1'): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId, lineIndex: 0 }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '', extraExampleEn: '',
  productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const pendingWord = (id: string, songId = 's1'): Word => ({
  id, lemma: id, surfaceForm: id, pos: 'noun', freqRank: 4000, songId, lineIndex: 1, contexts: [{ songId, lineIndex: 1 }],
  cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false,
})
const card = (id: string, itemId: string, due: Date, kind: CardRow['kind'] = 'R'): CardRow => ({
  id, itemType: 'chunk', itemId, kind, unlocked: 1, due,
  fsrs: { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 2, last_review: at(-5), due },
  goodRCount: 0,
})
const review = (id: string, cardId: string, reviewedAt: Date): Review => ({ id, cardId, rating: 3, auto: true, answer: null, elapsedMs: 9000, reviewedAt, wasNew: false })

/** n voci in scadenza (da ieri) nella canzone s1. */
async function seedDue(n: number, prefix = 'd') {
  for (let i = 0; i < n; i++) {
    await db.chunks.add(chunk(`${prefix}c${i}`))
    await db.cards.add(card(`${prefix}k${i}`, `${prefix}c${i}`, at(-1)))
  }
}
/** n voci già ripassate oggi, che tornano fra una settimana. */
async function seedReviewedToday(n: number) {
  for (let i = 0; i < n; i++) {
    await db.chunks.add(chunk(`rc${i}`))
    await db.cards.add(card(`rk${i}`, `rc${i}`, at(7)))
    await db.reviews.add(review(`rv${i}`, `rk${i}`, at(0, 9)))
  }
}
/** Una frase scritta (alle `when`) su una card Produci, ancora da correggere. */
async function seedPendingSentence(when: Date) {
  await db.chunks.add(chunk('pc'))
  await db.cards.add(card('pk', 'pc', at(7), 'P'))
  await db.sessions.add({
    id: 'w1', kind: 'review', songId: null, startedAt: when, endedAt: when,
    timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0,
    productions: [{ cardId: 'pk', itemId: 'pc', sentence: 'We sailed the paper sea.', elapsedMs: 1, wasNew: false, at: when }],
  })
}

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/'
})
afterEach(() => {
  cleanup()
  db.close()
})

const deps = (clock: () => Date = () => now) => ({ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: clock })
const mount = (clock?: () => Date) => render(<AppDepsProvider value={deps(clock)}><Today /></AppDepsProvider>)
const loaded = () => screen.findByRole('heading', { name: 'Ripasso di oggi' })
const invites = (c: Element) => c.querySelectorAll('a.final-due')

describe('anello del giorno e azione principale', () => {
  test('coda con 5 card e nessun ripasso oggi: 0 di 5, «Inizia il giro»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedDue(5)
    mount()
    expect(await screen.findByRole('img', { name: '0 di 5 card fatte oggi, circa 1 minuto su 30' })).toBeTruthy()
    expect(screen.getByText('5 card da fare')).toBeTruthy()
    // I minuti del timer stanno nell'anello: niente nota «su N minuti» sotto le statistiche, che restano.
    expect(screen.queryByText(/^su \d+ minut/)).toBeNull()
    for (const stat of ['in scadenza', 'nuove', 'stimati']) expect(screen.getByText(stat)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Inizia il giro' }).getAttribute('href')).toBe('#/session')
    expect(screen.queryByRole('link', { name: 'Continua il giro' })).toBeNull()
  })

  test('3 ripassi oggi e 2 card in coda: «Restano 2 card», «Continua il giro»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedDue(2)
    await seedReviewedToday(3)
    mount()
    expect(await screen.findByRole('img', { name: '3 di 5 card fatte oggi, circa 1 minuto su 30' })).toBeTruthy()
    expect(screen.getByText('Restano 2 card')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continua il giro' }).getAttribute('href')).toBe('#/session')
    expect(screen.queryByRole('link', { name: 'Inizia il giro' })).toBeNull()
  })

  test('tutto fatto, nessuna frase: «Fatto per oggi», nessun link alla sessione', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedReviewedToday(3)
    const { container } = mount()
    expect(await screen.findByRole('img', { name: '3 di 3 card fatte oggi' })).toBeTruthy()
    expect(screen.getByText('Fatto per oggi')).toBeTruthy()
    for (const stat of ['in scadenza', 'nuove', 'stimati']) expect(screen.getByText(stat)).toBeTruthy()
    expect(container.querySelector('a[href="#/session"]')).toBeNull()
  })

  test('nuove trattenute dal carico: la frase del blocco è nel «Perché?»', async () => {
    await saveSettings(db, { timerMinutes: { review: 2 } })
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedDue(11)
    await db.chunks.add(chunk('nw'))
    await db.cards.add({ id: 'knw', itemType: 'chunk', itemId: 'nw', kind: 'R', unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
    mount()
    expect(await screen.findByText('11 card da fare · nuove in pausa')).toBeTruthy()
    expect(screen.getByRole('img', { name: '0 di 11 card fatte oggi, circa 3 minuti su 2, card nuove in pausa' })).toBeTruthy()
    const why = screen.getByText('Per ora niente card nuove: il ripasso in scadenza supera i 2 minuti. Arrivano quando scende sotto.')
    expect(why.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Perché?' }))
    expect(why.hidden).toBe(false)
  })

  test('a mezzanotte con Oggi aperta l\'anello riparte da 0 e conta le card del giorno nuovo', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedDue(1)
    await seedReviewedToday(2)
    // in scadenza domattina
    await db.chunks.add(chunk('tm'))
    await db.cards.add(card('ktm', 'tm', at(1, 9)))
    let t = at(0, 23)
    mount(() => t)
    expect(await screen.findByRole('img', { name: '2 di 3 card fatte oggi, circa 1 minuto su 30' })).toBeTruthy()
    t = at(1, 8)
    window.dispatchEvent(new Event('focus'))
    expect(await screen.findByRole('img', { name: '0 di 2 card fatte oggi, circa 1 minuto su 30' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Inizia il giro' })).toBeTruthy()
  })
})

describe('coda vuota: l\'azione principale porta a ciò che crea card, senza invito doppio', () => {
  test('nessuna canzone: «Aggiungi una canzone»', async () => {
    const { container } = mount()
    await loaded()
    expect(screen.getByRole('link', { name: 'Aggiungi una canzone' }).getAttribute('href')).toBe('#/songs/new')
    expect(screen.getByText('Niente da ripassare oggi.')).toBeTruthy()
    expect(invites(container)).toHaveLength(0)
  })

  test('solo frasi da correggere (di ieri): «Correggi la frase con Gemini», e la spiegazione nel «Perché?»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedPendingSentence(at(-1))
    const { container } = mount()
    expect(await screen.findByRole('link', { name: 'Correggi la frase con Gemini' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Correggi la frase con Gemini' }).getAttribute('href')).toBe('#/feedback')
    expect(screen.getByText('Niente da ripassare oggi.')).toBeTruthy()
    expect(screen.getByText('Niente da ripassare per ora: le voci con una frase da correggere tornano nel ripasso dopo la correzione.')).toBeTruthy()
    expect(invites(container)).toHaveLength(0)
    expect(container.querySelectorAll('a[href="#/feedback"]')).toHaveLength(1)
  })

  test('ripasso fatto e frase scritta oggi da correggere: lo dice, e porta alle frasi', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedPendingSentence(at(0, 9))
    const { container } = mount()
    expect(await screen.findByText('Ripasso fatto · frasi da correggere')).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 di 1 card fatte oggi' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Correggi la frase con Gemini' }).getAttribute('href')).toBe('#/feedback')
    expect(invites(container)).toHaveLength(0)
  })

  test('più frasi da correggere: «Correggi le N frasi con Gemini»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedPendingSentence(at(-1))
    await db.chunks.add(chunk('pc2'))
    await db.cards.add(card('pk2', 'pc2', at(7), 'P'))
    await db.sessions.update('w1', { productions: [
      { cardId: 'pk', itemId: 'pc', sentence: 'We sailed the paper sea.', elapsedMs: 1, wasNew: false, at: at(-1) },
      { cardId: 'pk2', itemId: 'pc2', sentence: 'The moon was borrowed.', elapsedMs: 1, wasNew: false, at: at(-1) },
    ] })
    const { container } = mount()
    const cta = await screen.findByRole('link', { name: 'Correggi le 2 frasi con Gemini' })
    expect(cta.getAttribute('href')).toBe('#/feedback')
    expect(invites(container)).toHaveLength(0)
  })

  test('solo parole da smistare: «Smista le parole di «…»»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await db.words.add(pendingWord('gull'))
    const { container } = mount()
    const cta = await screen.findByRole('link', { name: 'Smista le parole di «Paper Sea»' })
    expect(cta.getAttribute('href')).toBe('#/songs/s1/triage')
    expect(invites(container)).toHaveLength(0)
    expect(container.querySelectorAll('a[href="#/songs/s1/triage"]')).toHaveLength(1)
  })

  test('le parole da smistare sono quelle di Smista (`pendingWords`), anche senza il verso fra i contesti', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    // Parola salvata prima dei contesti: Smista la trova dal suo verso (songId + lineIndex).
    await db.words.add({ ...pendingWord('gull'), contexts: [] })
    mount()
    const cta = await screen.findByRole('link', { name: 'Smista le parole di «Paper Sea»' })
    expect(cta.getAttribute('href')).toBe('#/songs/s1/triage')
  })

  test('anche per le completate le parole da smistare sono quelle di Smista (`pendingWords`)', async () => {
    await db.songs.bulkAdd([song('s1', 'Paper Sea', 'studying'), song('s2', 'Tin Harbour', 'done')])
    await seedDue(1)
    await db.words.bulkAdd([pendingWord('gull'), { ...pendingWord('tide', 's2'), contexts: [] }])
    mount()
    expect(await screen.findByRole('heading', { name: 'Da smistare nelle canzoni completate' })).toBeTruthy()
    const left = screen.getByRole('link', { name: /Tin Harbour/ })
    expect(left.textContent).toContain('Completata · 1 parola da smistare')
  })

  test('solo una canzone «Da studiare»: «Apri lo Studio di «…»»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'analyzed'))
    const { container } = mount()
    const cta = await screen.findByRole('link', { name: 'Apri lo Studio di «Paper Sea»' })
    expect(cta.getAttribute('href')).toBe('#/songs/s1')
    expect(invites(container)).toHaveLength(0)
  })

  test('solo una bozza: «Analizza «…»»', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'draft'))
    const { container } = mount()
    const cta = await screen.findByRole('link', { name: 'Analizza «Paper Sea»' })
    expect(cta.getAttribute('href')).toBe('#/songs/s1/analyzing')
    expect(invites(container)).toHaveLength(0)
  })

  test('nessuna canzone: «Aggiungi una canzone» passa dal controllo di sblocco e, se è tutto pronto, apre Aggiungi', async () => {
    mount()
    await loaded()
    const cta = screen.getByRole('link', { name: 'Aggiungi una canzone' })
    expect(fireEvent.click(cta)).toBe(false) // il link non si segue da solo: decide il controllo
    await waitFor(() => expect(window.location.hash).toBe('#/songs/new'))
  })

  test('nessuna canzone ma carico alto: «Aggiungi una canzone» apre il foglio dello sblocco', async () => {
    // Voci di Espandi (senza canzone) in ripasso fra due giorni, timer di 1 minuto: il carico non regge.
    await saveSettings(db, { timerMinutes: { review: 1 } })
    for (let i = 0; i < 40; i++) {
      await db.chunks.add({ ...chunk(`x${i}`), songId: '', contexts: [], origin: 'expand' })
      await db.cards.add(card(`xk${i}`, `x${i}`, at(2)))
    }
    mount()
    await loaded()
    fireEvent.click(screen.getByRole('link', { name: 'Aggiungi una canzone' }))
    expect(await screen.findByRole('dialog', { name: 'La prossima canzone non è ancora pronta' })).toBeTruthy()
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })

  test('canzoni senza niente da fare: nessuna azione principale', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    const { container } = mount()
    await loaded()
    expect(screen.getByText('Niente da ripassare oggi.')).toBeTruthy()
    expect(container.querySelector('a.btn.primary')).toBeNull()
  })
})

describe('invito in evidenza', () => {
  test('con card in coda, le parole da smistare sono l\'invito', async () => {
    await db.songs.add(song('s1', 'Paper Sea', 'studying'))
    await seedDue(1)
    await db.words.bulkAdd([pendingWord('gull'), pendingWord('tide')])
    mount()
    const invite = await screen.findByRole('link', { name: /2 parole da smistare in «Paper Sea»/ })
    expect(invite.getAttribute('href')).toBe('#/songs/s1/triage')
    expect(invite.querySelector('.section-label')?.textContent).toBe('DA SMISTARE')
    expect(screen.getByRole('link', { name: 'Inizia il giro' })).toBeTruthy()
  })

  test('con card in coda, una canzone da studiare è l\'invito', async () => {
    await db.songs.bulkAdd([song('s1', 'Paper Sea', 'studying'), song('s2', 'Borrowed Moon', 'analyzed')])
    await seedDue(1)
    mount()
    const invite = await screen.findByRole('link', { name: /“Borrowed Moon” è da studiare/ })
    expect(invite.getAttribute('href')).toBe('#/songs/s2')
    expect(invite.querySelector('.section-label')?.textContent).toBe('DA STUDIARE')
  })

  test('frasi da correggere e riascolto pronto: si vede l\'invito delle frasi; il riascolto si apre dal carosello', async () => {
    await db.songs.add(song('s1', 'Glass Tide', 'studying', { studyStartedAt: at(-8) }))
    await seedDue(1)
    await seedPendingSentence(at(-1))
    const { container } = mount()
    const invite = await screen.findByRole('link', { name: /LE TUE FRASI.*1 frase da correggere/ })
    expect(invite.getAttribute('href')).toBe('#/feedback')
    expect(invites(container)).toHaveLength(1)
    expect(screen.queryByText('RIASCOLTO FINALE')).toBeNull()
    const item = screen.getByRole('link', { name: /Glass Tide/ })
    expect(item.getAttribute('href')).toBe('#/songs/s1/final')
    expect(item.textContent).toContain('Riascolto pronto')
  })
})

describe('canzoni completate con parole da smistare', () => {
  test('con card in coda sono l\'invito, e non si ripetono sotto «Da smistare nelle canzoni completate»', async () => {
    await db.songs.bulkAdd([song('s1', 'Paper Sea', 'studying'), song('s2', 'Tin Harbour', 'done')])
    await seedDue(1)
    await db.words.add(pendingWord('gull', 's2'))
    const { container } = mount()
    const invite = await screen.findByRole('link', { name: /DA SMISTARE.*1 parola da smistare in «Tin Harbour»/ })
    expect(invite.getAttribute('href')).toBe('#/songs/s2/triage')
    expect(invites(container)).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Da smistare nelle canzoni completate' })).toBeNull()
  })

  test('a coda vuota l\'invito coincide con l\'azione e non si mostra: la canzone resta sotto il suo titolo', async () => {
    await db.songs.add(song('s2', 'Tin Harbour', 'done'))
    await db.words.add(pendingWord('gull', 's2'))
    const { container } = mount()
    const cta = await screen.findByRole('link', { name: 'Smista le parole di «Tin Harbour»' })
    expect(cta.getAttribute('href')).toBe('#/songs/s2/triage')
    expect(invites(container)).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Da smistare nelle canzoni completate' })).toBeTruthy()
    const row = screen.getByRole('link', { name: /Tin Harbour.*Completata · 1 parola da smistare/ })
    expect(row.getAttribute('href')).toBe('#/songs/s2')
  })
})

describe('carosello delle canzoni aperte', () => {
  const titles = ['Paper Sea', 'Borrowed Moon', 'Glass Tide', 'Copper Rain']
  test('4 canzoni aperte: 4 link con il titolo, niente «Aggiungi», la nota del limite', async () => {
    await db.songs.bulkAdd(titles.map((t, i) => song(`s${i + 1}`, t, 'studying', { addedAt: at(-10 + i) })))
    mount()
    expect(await screen.findByText('4 di 4')).toBeTruthy()
    for (const [i, t] of titles.entries()) {
      expect(screen.getByRole('link', { name: new RegExp(t) }).getAttribute('href')).toBe(`#/songs/s${i + 1}`)
    }
    expect(screen.queryByRole('link', { name: 'Aggiungi' })).toBeNull()
    expect(screen.getByText(LIMIT_NOTE)).toBeTruthy()
  })

  test('la copertina di una bozza porta all\'analisi, quella di una canzone da studiare allo Studio', async () => {
    await db.songs.bulkAdd([
      song('s1', 'Paper Sea', 'draft', { addedAt: at(-10) }),
      song('s2', 'Borrowed Moon', 'analyzed', { addedAt: at(-9) }),
    ])
    const { container } = mount()
    await screen.findByText('2 di 4')
    const covers = [...container.querySelectorAll<HTMLAnchorElement>('.song-carousel a')]
    expect(covers.find((a) => a.textContent!.includes('Paper Sea'))!.getAttribute('href')).toBe('#/songs/s1/analyzing')
    expect(covers.find((a) => a.textContent!.includes('Borrowed Moon'))!.getAttribute('href')).toBe('#/songs/s2')
  })

  test('2 canzoni: «Aggiungi» apre il controllo di sblocco', async () => {
    await db.songs.bulkAdd(titles.slice(0, 2).map((t, i) => song(`s${i + 1}`, t, 'studying', { addedAt: at(-10 + i) })))
    await db.chunks.bulkAdd([chunk('a'), chunk('b')])
    await db.cards.bulkAdd([...newCardPair('chunk', 'a', now), ...newCardPair('chunk', 'b', now)])
    mount()
    expect(await screen.findByText('2 di 4')).toBeTruthy()
    expect(screen.queryByText(LIMIT_NOTE)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Aggiungi' }))
    expect(await screen.findByRole('dialog', { name: 'La prossima canzone non è ancora pronta' })).toBeTruthy()
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })
})
