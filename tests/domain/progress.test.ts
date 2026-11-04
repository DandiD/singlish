import { describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { progressStats } from '../../src/domain/progress'
import { DEFAULT_SETTINGS } from '../../src/domain/settings'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Review, Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const day = (n: number) => new Date(now.getTime() + n * 86400000)
const song = (id: string, added: number, before: number | null, status: Song['status'] = 'studying'): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status, level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: before, grammarPoint: null, connectedSpeech: [], addedAt: day(added), analyzedAt: day(added),
})
const chunk = (id: string, cefr = 'B1'): Chunk => ({
  id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom',
  cefr, register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const card = (itemId: string, kind: 'R' | 'C', state: State, due: Date): CardRow => ({
  id: itemId + kind, itemType: 'chunk', itemId, kind, unlocked: 1, due, fsrs: { ...newFsrsCard(now), state, due }, goodRCount: 2,
})
const review = (i: number, rating: 1 | 3, wasNew = false, at = day(-1)): Review => ({
  id: 'r' + i, cardId: 'x', rating, auto: false, answer: null, elapsedMs: 12000, reviewedAt: at, wasNew,
})

const base = {
  settings: { ...DEFAULT_SETTINGS, level: 'B1' as const },
  songs: [song('s1', -20, 40), song('s2', -10, 55), song('s3', -5, null), song('s4', -2, 62, 'done')],
  chunks: [chunk('a'), chunk('b'), chunk('c', 'B2')],
  cards: [
    card('a', 'C', State.Review, day(2)), card('b', 'C', State.Review, day(30)), card('c', 'C', State.Review, day(1)),
    card('a', 'R', State.Review, day(0.2)),
  ],
  reviews: [review(1, 3), review(2, 3), review(3, 1), review(4, 3), review(5, 1, true), review(6, 1, false, day(-40))],
  avgSeconds: 60,
}

describe('progressi', () => {
  test('comprensione al primo ascolto: le canzoni con la % segnata, dalla più vecchia; l\'ultima è il valore attuale', () => {
    const p = progressStats(base, now)
    expect(p.comprehension.map((x) => x.pct)).toEqual([40, 55, 62])
    expect(p.comprehension[0].title).toBe('s1')
    expect(p.currentComprehension).toBe(62)
  })
  test('lessico attivo: voci con la card Completa in ripasso; quelle del livello attuale contano per salire', () => {
    const p = progressStats(base, now)
    expect(p.active).toBe(3)
    expect(p.activeAtLevel).toBe(2)
  })
  test('memoria reale: ripassi (non nuovi) degli ultimi 30 giorni non dimenticati', () => {
    expect(progressStats(base, now).retention).toBeCloseTo(3 / 4)
  })
  test('carico: minuti al giorno in media sui prossimi 7 giorni, con le card in scadenza', () => {
    // in 7 giorni: le voci «a» (R oggi, C fra 2 giorni) e «c» (domani) = 2 voci × 60 s su 7 giorni (una card per voce, come la sessione)
    expect(progressStats(base, now).loadMinutesPerDay).toBeCloseTo(2 / 7)
  })
  test('verso il livello successivo: 150 voci attive del livello e 70% al primo ascolto', () => {
    const p = progressStats(base, now)
    expect(p.nextLevel).toBe('B2')
    expect(p.levelProgress).toBeCloseTo(Math.min(2 / 150, 1) * 0.5 + Math.min(62 / 70, 1) * 0.5)
  })
  test('senza dati: niente numeri inventati', () => {
    const p = progressStats({ ...base, songs: [], chunks: [], cards: [], reviews: [] }, now)
    expect(p.comprehension).toEqual([])
    expect(p.currentComprehension).toBeNull()
    expect(p.retention).toBeNull()
    expect(p.active).toBe(0)
  })
})
