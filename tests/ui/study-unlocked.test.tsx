import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { newFsrsCard } from '../../src/domain/scheduler'
import { resetCoverAttempts } from '../../src/domain/cover'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'

// Testi inventati. Riga 0: chunk c1; riga 1: parola w1; riga 2: nessuna voce.
let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null, status: 'studying', level: 'B2',
  lines: ['I let it slide along the lantern road', 'we drift and wander home', 'only the gulls are left'],
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const chunk: Chunk = {
  id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
  contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig',
  explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false,
}
const word: Word = {
  id: 'w1', lemma: 'drift', surfaceForm: 'drift', pos: 'verb', freqRank: 4000, songId: 's1', lineIndex: 1,
  contexts: [{ songId: 's1', lineIndex: 1 }], cefr: 'B2', register: 'usable', topic: '', meaningIt: 'sig', explanationIt: '',
  extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false,
}
const card = (id: string, itemType: CardRow['itemType'], itemId: string, state: State): CardRow => ({
  id, itemType, itemId, kind: 'R', unlocked: 1, due: now,
  fsrs: { ...newFsrsCard(now), state, due: now, reps: state === State.New ? 0 : 2, stability: 3, difficulty: 5 },
  goodRCount: 0,
})

beforeEach(async () => {
  resetCoverAttempts()
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/songs/s1'
  await db.songs.add(song)
  await db.chunks.add(chunk)
  await db.words.add(word)
  await db.cards.bulkAdd([card('k1', 'chunk', 'c1', State.Review), card('k2', 'word', 'w1', State.New)])
})
afterEach(() => {
  cleanup()
  db.close()
})

const mount = () =>
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" />
    </AppDepsProvider>,
  )
const paras = () => [...document.querySelectorAll('.lyrics p')] as HTMLElement[]
const seen = async () => (await db.songs.get('s1'))!.unlockedSeen

describe('Studio: testo vivo', () => {
  test('classi per riga e conteggio in testa', async () => {
    mount()
    await screen.findByText(/1 di 2 versi sbloccati/)
    const [p0, p1, p2] = paras()
    expect(p0.classList.contains('line-open')).toBe(true)
    expect(p1.classList.contains('line-studying')).toBe(true)
    expect(p2.className).toBe('')
    expect(document.querySelector('.study-head .note')!.textContent).toBe('Studio · 1 chunk · 1 parola · 1 di 2 versi sbloccati')
  })

  test('senza versi con voci la testa non ha il conteggio', async () => {
    await db.chunks.clear()
    await db.words.clear()
    mount()
    await screen.findByText('Studio · 0 chunk · 0 parole')
    expect(paras().every((p) => p.className === '')).toBe(true)
  })

  test('primo ingresso: il verso si accende e unlockedSeen si salva; il secondo no', async () => {
    await db.songs.update('s1', { unlockedSeen: [] })
    mount()
    await waitFor(() => expect(paras()[0].classList.contains('line-lit')).toBe(true))
    expect(paras()[0].style.getPropertyValue('--i')).toBe('0')
    await waitFor(async () => expect(await seen()).toEqual([0]))
    // la riscrittura non spegne l'animazione in questa vista
    await new Promise((r) => setTimeout(r, 50))
    expect(paras()[0].classList.contains('line-lit')).toBe(true)
    cleanup()
    mount()
    await screen.findByText(/1 di 2 versi sbloccati/)
    expect(paras()[0].classList.contains('line-open')).toBe(true)
    expect(document.querySelector('.line-lit')).toBeNull()
  })

  test('verso che si riblocca: tenue, senza animazione, e unlockedSeen lo perde', async () => {
    await db.songs.update('s1', { unlockedSeen: [0] })
    await db.cards.update('k1', { 'fsrs.state': State.Relearning })
    mount()
    await screen.findByText(/0 di 2 versi sbloccati/)
    expect(paras()[0].classList.contains('line-studying')).toBe(true)
    expect(document.querySelector('.line-lit')).toBeNull()
    await waitFor(async () => expect(await seen()).toEqual([]))
  })

  test('in modalità Chiedi a Gemini nessuna classe', async () => {
    mount()
    await screen.findByText(/1 di 2 versi sbloccati/)
    fireEvent.click(screen.getByRole('button', { name: 'Chiedi a Gemini' }))
    await waitFor(() => expect(document.querySelector('.lyrics.picking')).not.toBeNull())
    expect(paras().every((p) => !/line-/.test(p.className))).toBe(true)
  })

  test('canzone senza unlockedSeen: nulla si accende, ma l\'elenco si salva', async () => {
    mount()
    await screen.findByText(/1 di 2 versi sbloccati/)
    await waitFor(async () => expect(await seen()).toEqual([0]))
    expect(document.querySelector('.line-lit')).toBeNull()
    expect(paras()[0].classList.contains('line-open')).toBe(true)
  })

  test('sette versi nuovi: --i limitato a 4', async () => {
    const lines = Array.from({ length: 7 }, (_, i) => `invented verse ${i}`)
    await db.songs.update('s1', { lines, unlockedSeen: [] })
    await db.chunks.clear()
    await db.words.clear()
    await db.cards.clear()
    const cs: Chunk[] = lines.map((_, i) => ({ ...chunk, id: 'x' + i, key: 'x' + i, lineIndex: i, contexts: [{ songId: 's1', lineIndex: i }] }))
    await db.chunks.bulkAdd(cs)
    await db.cards.bulkAdd(cs.map((c) => card('k' + c.id, 'chunk', c.id, State.Review)))
    mount()
    await waitFor(() => expect(document.querySelectorAll('.line-lit')).toHaveLength(7))
    expect(paras().map((p) => p.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4', '4', '4'])
  })

  test('uscendo da Chiedi a Gemini il verso non si riaccende', async () => {
    await db.songs.update('s1', { unlockedSeen: [] })
    mount()
    await waitFor(() => expect(paras()[0].classList.contains('line-lit')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Chiedi a Gemini' }))
    await waitFor(() => expect(document.querySelector('.lyrics.picking')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /Annulla/ }))
    await waitFor(() => expect(document.querySelector('.lyrics.picking')).toBeNull())
    expect(paras()[0].classList.contains('line-open')).toBe(true)
    expect(document.querySelector('.line-lit')).toBeNull()
  })
})
