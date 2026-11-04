import { expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { readiness, effectiveNewPerDay, INTENSIVE } from '../../src/domain/readiness'
import { DEFAULT_SETTINGS } from '../../src/domain/settings'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song = (id: string, status: Song['status'] = 'studying'): Song => ({
  id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['x'], status, level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
})
const chunk = (id: string, songId: string): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId, lineIndex: 0 }], type: 'idiom', cefr: 'B1',
  register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false,
})
const card = (itemId: string, state: State, dueDays = 1): CardRow => ({
  id: itemId + 'R', itemType: 'chunk', itemId, kind: 'R', unlocked: 1, due: new Date(now.getTime() + dueDays * 86400000), fsrs: { ...newFsrsCard(now), state }, goodRCount: 0,
})

test('pronta: voci tutte nel ripasso, carico sotto il tetto, posti liberi', () => {
  const r = readiness({ settings: DEFAULT_SETTINGS, songs: [song('a')], chunks: [chunk('c1', 'a')], words: [], cards: [card('c1', State.Review)], avgSeconds: 12 }, now)
  expect(r).toMatchObject({ ready: true, notInReview: [], loadOk: true, openSongs: 1 })
})

test('non pronta: una canzone ha ancora voci fuori dal ripasso', () => {
  const r = readiness({ settings: DEFAULT_SETTINGS, songs: [song('a')], chunks: [chunk('c1', 'a'), chunk('c2', 'a')], words: [], cards: [card('c1', State.Review), card('c2', State.New)], avgSeconds: 12 }, now)
  expect(r.ready).toBe(false)
  expect(r.notInReview).toEqual([{ title: 'a', chunks: 1, words: 0, toTriage: 0 }])
})

test('non pronta: il carico dei prossimi 7 giorni supera il tetto', () => {
  const cards = Array.from({ length: 300 }, (_, i) => card('c' + i, State.Review, 1))
  const chunks = cards.map((c) => chunk(c.itemId, 'a'))
  const r = readiness({ settings: DEFAULT_SETTINGS, songs: [song('a')], chunks, words: [], cards, avgSeconds: 60 }, now)
  expect(r.loadOk).toBe(false)
  expect(r.ready).toBe(false)
})

test('modalità intensiva: 25 nuove al giorno finché dura, poi torna il valore scelto', () => {
  const on = { ...DEFAULT_SETTINGS, newPerDay: 16, intensiveUntil: new Date(now.getTime() + 86400000) }
  expect(effectiveNewPerDay(on, now)).toBe(INTENSIVE.newPerDay)
  expect(effectiveNewPerDay({ ...on, intensiveUntil: new Date(now.getTime() - 1) }, now)).toBe(16)
  expect(effectiveNewPerDay(DEFAULT_SETTINGS, now)).toBe(DEFAULT_SETTINGS.newPerDay)
})

test('non pronta: una canzone in studio ha parole mai smistate (come Oggi e lo Studio)', () => {
  const pending: Word = { id: 'w1', lemma: 'w', surfaceForm: 'w', pos: 'noun', freqRank: 4000, songId: 'a', lineIndex: 0, contexts: [{ songId: 'a', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false }
  const r = readiness({ settings: DEFAULT_SETTINGS, songs: [song('a')], chunks: [chunk('c1', 'a')], words: [{ ...pending }], cards: [card('c1', State.Review)], avgSeconds: 12 }, now)
  expect(r.ready).toBe(false)
  expect(r.notInReview).toEqual([{ title: 'a', chunks: 0, words: 0, toTriage: 1 }])
})
