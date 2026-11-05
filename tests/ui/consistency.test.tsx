import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Today } from '../../src/ui/screens/Today'
import { Songs } from '../../src/ui/screens/Songs'
import { FinalListen } from '../../src/ui/screens/FinalListen'
import { Study } from '../../src/ui/screens/Study'
import { Session } from '../../src/ui/screens/Session'
import { activeSongCount, LIMIT_NOTE } from '../../src/domain/ingest'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'

// Testi inventati. Due canzoni condividono un chunk (in forme diverse) e una parola.
let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const at = (min: number) => new Date(now.getTime() + min * 60_000)

const song = (id: string, title: string, status: Song['status'], addedMin: number, lines: string[] = []): Song => ({
  id, kind: 'song', title, artist: '', spotifyUrl: null, lines, status, level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: at(addedMin), analyzedAt: null,
})
const chunk = (id: string, songId: string, surface: string, contexts: Chunk['contexts'], extra: Partial<Chunk> = {}): Chunk => ({
  id, songId, key: surface, baseForm: surface, surfaceForm: surface, lineIndex: contexts[0].lineIndex, contexts,
  type: 'idiom', cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '', extraExampleEn: '',
  productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, ...extra,
})
const word = (id: string, songId: string, lemma: string, triage: Word['triage'], contexts: Word['contexts']): Word => ({
  id, lemma, surfaceForm: lemma, pos: 'verb', freqRank: 4000, songId, lineIndex: contexts[0].lineIndex, contexts,
  cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '', extraExampleEn: '',
  triage, userEdited: false, suspended: false,
})
const card = (id: string, itemType: CardRow['itemType'], itemId: string, state: State, due: Date): CardRow => ({
  id, itemType, itemId, kind: 'R', unlocked: 1, due,
  fsrs: { ...newFsrsCard(now), state, due, reps: state === State.New ? 0 : 2, stability: 3, difficulty: 5 },
  goodRCount: 0,
})

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/'
  await db.songs.bulkAdd([
    song('s1', 'Lantern Road', 'studying', -50, ['I let it slide along the lantern road', 'we drift and wander home']),
    song('s2', 'Harbour Lights', 'analyzed', -40, ['letting it slide past the harbour', 'the gulls wander low']),
    song('s3', 'Bozza', 'draft', -30),
    song('s4', 'In coda', 'queued', -20),
    song('s5', 'Finita', 'done', -60),
  ])
  await db.chunks.bulkAdd([
    chunk('c1', 's1', 'let it slide', [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 0, surfaceForm: 'letting it slide' }]),
    chunk('c2', 's1', 'lantern road', [{ songId: 's1', lineIndex: 0 }], { suspended: true }),
  ])
  await db.words.bulkAdd([
    word('w1', 's1', 'drift', 'learn', [{ songId: 's1', lineIndex: 1 }]),
    word('w2', 's1', 'home', 'pending', [{ songId: 's1', lineIndex: 1 }]),
    word('w3', 's1', 'along', 'known', [{ songId: 's1', lineIndex: 0 }]),
    // nata in s2, compare anche in s1
    word('w4', 's2', 'wander', 'learn', [{ songId: 's2', lineIndex: 1 }, { songId: 's1', lineIndex: 1 }]),
  ])
})
afterEach(() => {
  cleanup()
  db.close()
})

const deps = () => ({ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now })
const mount = (node: preact.JSX.Element) => render(<AppDepsProvider value={deps()}>{node}</AppDepsProvider>)
const statNum = (label: string) =>
  screen.getByText(label, { selector: '.stat .note' }).parentElement!.querySelector('.stat-num')!.textContent

describe('canzoni aperte', () => {
  test('Oggi conta le stesse canzoni aperte del limite di Canzoni e Aggiungi', async () => {
    mount(<Today />)
    const open = await activeSongCount(db)
    expect(open).toBe(4)
    expect(await screen.findByText(`${open} di 4`)).toBeTruthy()
    // le bozze e le canzoni in coda sono elencate, e portano all'analisi
    const draft = screen.getByRole('link', { name: /Bozza/ })
    expect(draft.getAttribute('href')).toBe('#/songs/s3/analyzing')
    expect(screen.getByRole('link', { name: /In coda/ }).textContent).toContain('Da analizzare')
    expect(screen.queryByRole('link', { name: /Finita/ })).toBeNull()
  })
  test('al limite Oggi non offre Aggiungi e lo spiega come Canzoni', async () => {
    mount(<Today />)
    await screen.findByText('4 di 4')
    expect(screen.queryByRole('link', { name: 'Aggiungi' })).toBeNull()
    expect(screen.getByText(LIMIT_NOTE)).toBeTruthy()
    cleanup()
    mount(<Songs />)
    expect(((await screen.findByRole('button', { name: 'Aggiungi' })) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(LIMIT_NOTE)).toBeTruthy()
  })
  test('sotto il limite Oggi offre Aggiungi', async () => {
    await db.songs.update('s4', { status: 'done' })
    mount(<Today />)
    await screen.findByText('3 di 4')
    expect(screen.getByRole('link', { name: 'Aggiungi' })).toBeTruthy()
    expect(screen.queryByText(LIMIT_NOTE)).toBeNull()
  })
  test('una canzone sola ha l\'etichetta al singolare', async () => {
    mount(<Songs />)
    const card = (await screen.findByRole('heading', { name: 'Finita' })).closest('li')!
    expect(card.textContent).toContain('Completata')
  })
})

describe('studio di una canzone', () => {
  const highlighted = () =>
    new Set([...document.querySelectorAll('.lyrics a')].map((a) => new URL(a.getAttribute('href')!, 'http://x').hash))

  test('i conteggi in testa sono le voci evidenziate nel testo, anche quelle nate in un\'altra canzone', async () => {
    mount(<Study songId="s1" />)
    await screen.findByRole('heading', { name: 'Lantern Road' })
    // c1 · w1 (da imparare), w2 (da smistare), w4 (da s2); c2 sospeso e w3 nota fuori
    expect(screen.getByText(/^Studio · 1 chunk · 3 parole/)).toBeTruthy()
    expect(highlighted().size).toBe(4)
  })
  test('nella seconda canzone il chunk condiviso è evidenziato nella forma in cui compare', async () => {
    mount(<Study songId="s2" />)
    await screen.findByRole('heading', { name: 'Harbour Lights' })
    const link = [...document.querySelectorAll<HTMLAnchorElement>('.lyrics a')].find((a) => a.getAttribute('href')!.endsWith('item=c1'))
    expect(link?.textContent).toBe('letting it slide')
    expect(screen.getByText(/^Studio · 1 chunk · 1 parola/)).toBeTruthy()
  })
  test('la scheda evidenzia la forma del verso di questa canzone', async () => {
    window.location.hash = '#/songs/s2?item=c1'
    mount(<Study songId="s2" itemId="c1" />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.examples .hl')?.textContent).toBe('letting it slide')
  })
  test('Oggi conta per la canzone le voci dello studio meno quelle ancora da smistare', async () => {
    // «Da studiare» è la riga di Oggi che conta le voci; si legge prima di aprire lo Studio (che porta la canzone «in studio»).
    await db.songs.update('s1', { status: 'analyzed' })
    mount(<Today />)
    const card = (await screen.findByRole('heading', { name: 'Lantern Road' })).closest('a')!
    const today = +card.textContent!.match(/Da studiare · (\d+) chunk e parole/)![1]
    cleanup()
    mount(<Study songId="s1" />)
    await screen.findByRole('heading', { name: 'Lantern Road' })
    // c1 · w1 · w2 (da smistare) · w4 = 1 chunk + 3 parole; Oggi toglie w2
    const m = screen.getByText(/^Studio · /).textContent!.match(/(\d+) chunk · (\d+) parol/)!
    expect(today).toBe(+m[1] + +m[2] - 1)
    expect(today).toBe(3)
  })
})

describe('versi sbloccati: stessa frase in Oggi, Riascolto finale e Canzoni', () => {
  test('1 di 2 versi sbloccati ovunque', async () => {
    // riga 0: solo c1 (w3 è nota, c2 sospeso) -> sbloccata; riga 1: w1 in Review, w4 nuova -> no
    await db.cards.bulkAdd([
      card('u1', 'chunk', 'c1', State.Review, at(60)),
      card('u2', 'word', 'w1', State.Review, at(60)),
      card('u3', 'word', 'w4', State.New, at(60)),
    ])
    const phrase = (el: Element) => el.textContent!.match(/\d+ di \d+ vers[oi] sbloccat[oi]/)![0]
    mount(<Today />)
    const fromToday = phrase((await screen.findByRole('heading', { name: 'Lantern Road' })).closest('a')!)
    cleanup()
    mount(<FinalListen songId="s1" />)
    fireEvent.input(await screen.findByLabelText('Quanto hai capito adesso?'), { target: { value: '70' } })
    const fromFinal = phrase(document.querySelector('.result-note')!)
    cleanup()
    mount(<Songs />)
    const fromSongs = phrase((await screen.findByRole('heading', { name: 'Lantern Road' })).closest('li')!)
    expect([fromToday, fromFinal, fromSongs]).toEqual(['1 di 2 versi sbloccati', '1 di 2 versi sbloccati', '1 di 2 versi sbloccati'])
    cleanup()
    mount(<Study songId="s1" />)
    await screen.findByRole('heading', { name: 'Lantern Road' })
    const fromStudy = await waitFor(() => phrase(document.querySelector('.study-head .note')!))
    expect(fromStudy).toBe(fromToday)
  })
})

describe('ripasso', () => {
  beforeEach(async () => {
    // sessione lasciata a metà: c1 ripassato con «Di nuovo», torna in scadenza oggi
    await db.sessions.add({
      id: 'r1', kind: 'review', songId: null, startedAt: at(-30), endedAt: null,
      timer: { status: 'paused', durationMs: 30 * 60_000, accumulatedMs: 60_000, resumedAt: null },
      reviewsDone: 1, newDone: 0,
    })
    await db.cards.bulkAdd([
      card('k1', 'chunk', 'c1', State.Relearning, at(-1)),
      card('k2', 'word', 'w1', State.Review, at(-24 * 60)),
      card('k3', 'word', 'w4', State.New, at(-60)),
    ])
    await db.reviews.add({ id: 'v1', cardId: 'k1', rating: 1, auto: false, answer: null, elapsedMs: 9000, reviewedAt: at(-10), wasNew: false })
  })

  test('Oggi mostra le card che la sessione aperta deve ancora far vedere', async () => {
    mount(<Today />)
    await screen.findByRole('heading', { name: 'Ripasso di oggi' })
    expect(statNum('in scadenza')).toBe('1')
    expect(statNum('nuove')).toBe('1')
    cleanup()
    mount(<Session />)
    // 1 già fatta + le 2 che Oggi annuncia
    expect(await screen.findByText('2 di 3')).toBeTruthy()
  })
  test('a sessione chiusa la card ripassata torna nel conto di Oggi', async () => {
    await db.sessions.update('r1', { endedAt: at(-5) })
    mount(<Today />)
    await screen.findByRole('heading', { name: 'Ripasso di oggi' })
    await waitFor(() => expect(statNum('in scadenza')).toBe('2'))
  })
})

describe('canzone tenuta per più avanti', () => {
  test('Canzoni e Oggi la chiamano allo stesso modo: Da studiare', async () => {
    mount(<Songs />)
    const card = (await screen.findByRole('heading', { name: 'Harbour Lights' })).closest('li')!
    expect(card.querySelector('.badge')!.textContent).toBe('Da studiare')
    cleanup()
    mount(<Today />)
    const today = (await screen.findByRole('heading', { name: 'Harbour Lights' })).closest('a')!
    expect(today.textContent).toContain('Da studiare')
    expect(today.getAttribute('href')).toBe('#/songs/s2')
  })
  test('aprirne lo Studio la mette in studio', async () => {
    mount(<Study songId="s2" />)
    await screen.findByRole('heading', { name: 'Harbour Lights' })
    await waitFor(async () => expect((await db.songs.get('s2'))!.status).toBe('studying'))
  })
  test('aprire lo Studio di una canzone completata non la riapre', async () => {
    mount(<Study songId="s5" />)
    await screen.findByRole('heading', { name: 'Finita' })
    await new Promise((r) => setTimeout(r, 50))
    expect((await db.songs.get('s5'))!.status).toBe('done')
  })
})

describe('parole da smistare', () => {
  test('il banner dello Studio conta le parole che Smista mostra, anche quelle nate altrove, senza le sospese', async () => {
    await db.words.bulkAdd([
      word('w5', 's2', 'gulls', 'pending', [{ songId: 's2', lineIndex: 1 }, { songId: 's1', lineIndex: 0 }]),
      word('w7', 's2', 'low', 'pending', [{ songId: 's2', lineIndex: 1 }, { songId: 's1', lineIndex: 1 }]),
      { ...word('w6', 's1', 'road', 'pending', [{ songId: 's1', lineIndex: 0 }]), suspended: true },
    ])
    mount(<Study songId="s1" />)
    // w2 di s1, w5 e w7 da s2; w6 sospesa fuori
    expect(await screen.findByText('3 parole nuove da smistare')).toBeTruthy()
  })
})

describe('dati salvati prima della forma per verso', () => {
  test('una voce condivisa senza forma del verso si evidenzia con la forma base, se è nel verso', async () => {
    // come le canzoni analizzate prima: nessuna surfaceForm nel contesto di s2; nel verso c'è la forma base
    await db.songs.update('s2', { lines: ['we let it slide past the harbour', 'the gulls wander low'] })
    await db.chunks.update('c1', {
      surfaceForm: 'letting it slide', baseForm: 'let it slide',
      contexts: [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 0 }],
    })
    mount(<Study songId="s2" />)
    await screen.findByRole('heading', { name: 'Harbour Lights' })
    const ids = new Set([...document.querySelectorAll('.lyrics a')].map((a) => a.getAttribute('href')!.split('item=')[1]))
    expect(ids.has('c1')).toBe(true)
    expect(screen.getByText(/^Studio · 1 chunk · 1 parola/)).toBeTruthy()
    expect(ids.size).toBe(2)
  })
})

describe('Oggi e Studio sulla stessa canzone', () => {
  const studyNumbers = () => {
    const m = screen.getByText(/^Studio · /).textContent!.match(/(\d+) chunk · (\d+) parol/)!
    const banner = screen.queryByText(/da smistare$/)?.textContent?.match(/^(\d+)/)
    return { items: +m[1] + +m[2], pending: banner ? +banner[1] : 0 }
  }
  const todayTotal = async (title: string) => {
    const card = (await screen.findByRole('heading', { name: title })).closest('a')!
    return +card.textContent!.match(/Da studiare · (\d+) chunk e parole/)![1]
  }
  test('il totale di Oggi è sempre le voci dello Studio meno quelle da smistare, prima e dopo lo smistamento', async () => {
    const { applyTriage } = await import('../../src/domain/triage')
    for (const step of ['prima', 'dopo'] as const) {
      if (step === 'dopo') await applyTriage(db, { w2: 'learn' }, now)
      mount(<Study songId="s1" />)
      await screen.findByRole('heading', { name: 'Lantern Road' })
      await waitFor(() => expect(screen.getByText(/^Studio · /)).toBeTruthy())
      const s = studyNumbers()
      cleanup()
      // «Da studiare» è la riga di Oggi che conta le voci: si legge con la canzone non ancora in studio.
      await db.songs.update('s1', { status: 'analyzed' })
      mount(<Today />)
      expect(await todayTotal('Lantern Road')).toBe(s.items - s.pending)
      if (step === 'dopo') expect(s.pending).toBe(0)
      await db.songs.update('s1', { status: 'studying' })
      cleanup()
    }
  })
})

describe('voce salvata senza la forma del verso (dati vecchi)', () => {
  const shown = () => new Set([...document.querySelectorAll('.lyrics a')].map((a) => a.getAttribute('href')!.split('item=')[1]))
  const counted = () => {
    const m = screen.getByText(/^Studio · /).textContent!.match(/(\d+) chunk · (\d+) parol/)!
    return +m[1] + +m[2]
  }
  test('verbo irregolare: «run out of» si evidenzia come «ran out of» e si conta', async () => {
    await db.songs.update('s2', { lines: ['we ran out of words past the harbour', 'the gulls wander low'] })
    await db.chunks.add(chunk('c3', 's1', 'running out of', [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 0 }], { baseForm: 'run out of', key: 'run out of' }))
    mount(<Study songId="s2" />)
    await screen.findByRole('heading', { name: 'Harbour Lights' })
    const link = [...document.querySelectorAll('.lyrics a')].find((a) => a.getAttribute('href')!.endsWith('item=c3'))
    expect(link?.textContent).toBe('ran out of')
    const listed = document.querySelectorAll('.other-items a').length
    expect(counted()).toBe(shown().size + listed)
  })
  test('forma che non si riesce a trovare: elencata sotto il testo, contata in Studio come in Oggi', async () => {
    await db.songs.update('s2', { lines: ['you forsook me by the harbour', 'the gulls wander low'] })
    await db.chunks.add(chunk('c3', 's1', 'forsaking me', [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 0 }], { baseForm: 'forsake me', key: 'forsake me' }))
    mount(<Study songId="s2" />)
    await screen.findByRole('heading', { name: 'Harbour Lights' })
    const others = screen.getByRole('list', { name: 'Altre voci di questa canzone' })
    const link = within(others).getByRole('link', { name: /forsake me/ })
    expect(link.getAttribute('href')).toBe('#/songs/s2?item=c3')
    const reachable = shown().size + within(others).getAllByRole('link').length
    expect(counted()).toBe(reachable)
    cleanup()
    await db.songs.update('s2', { status: 'analyzed' }) // aprire lo Studio la porta «in studio»
    mount(<Today />)
    const card = (await screen.findByRole('heading', { name: 'Harbour Lights' })).closest('a')!
    expect(card.textContent).toContain(`Da studiare · ${reachable} chunk e parole`)
  })
})

test('una parola dentro un chunk dello stesso verso: elencata sotto il testo, contata in Studio e Oggi', async () => {
  await db.words.add(word('w9', 's1', 'slide', 'learn', [{ songId: 's1', lineIndex: 0 }]))
  mount(<Study songId="s1" />)
  await screen.findByRole('heading', { name: 'Lantern Road' })
  const ids = new Set([...document.querySelectorAll('.lyrics a')].map((a) => a.getAttribute('href')!.split('item=')[1]))
  expect(ids.has('w9')).toBe(false)
  const others = screen.getByRole('list', { name: 'Altre voci di questa canzone' })
  expect(within(others).getByRole('link', { name: /slide/ }).getAttribute('href')).toBe('#/songs/s1?item=w9')
  const reachable = ids.size + within(others).getAllByRole('link').length
  const m = screen.getByText(/^Studio · /).textContent!.match(/(\d+) chunk · (\d+) parol/)!
  expect(+m[1] + +m[2]).toBe(reachable)
  const pending = 1 // w2
  cleanup()
  await db.songs.update('s1', { status: 'analyzed' })
  mount(<Today />)
  const card = (await screen.findByRole('heading', { name: 'Lantern Road' })).closest('a')!
  expect(card.textContent).toContain(`Da studiare · ${reachable - pending} chunk e parole`)
})
