import { describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { lexicon, coverage, type LexFilter } from '../../src/domain/lexicon'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const song = (id: string, title: string): Song => ({
  id, kind: 'song', title, artist: '', spotifyUrl: null, lines: ['x'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
})
const chunk = (id: string, over: Partial<Chunk> = {}): Chunk => ({
  id, songId: 's1', key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  type: 'idiom', cefr: 'B2', register: 'usable', topic: 'emotions', meaningIt: 'sig ' + id, explanationIt: '', extraExampleEn: '',
  productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const word = (id: string, over: Partial<Word> = {}): Word => ({
  id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 4000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'money', meaningIt: 'parola ' + id, explanationIt: '', extraExampleEn: '',
  triage: 'learn', userEdited: false, suspended: false, ...over,
})
const card = (itemId: string, kind: 'R' | 'C', state: State, unlocked: 0 | 1 = 1): CardRow => ({
  id: itemId + kind, itemType: 'chunk', itemId, kind, unlocked, due: now, fsrs: { ...newFsrsCard(now), state }, goodRCount: 0,
})

const songs = [song('s1', 'Lantern Road'), song('s2', 'Harbour Lights')]
const chunks = [
  chunk('let it slide'),
  chunk('figure out', { type: 'phrasal_verb', cefr: 'B1', contexts: [{ songId: 's1', lineIndex: 0 }, { songId: 's2', lineIndex: 0 }], meaningIt: 'capire, risolvere' }),
  chunk("ain't", { type: 'slang', register: 'song_only', topic: 'other' }),
  chunk('hold on', { suspended: true }),
]
const words = [word('wander', { topic: 'travel' }), word('drift', { triage: 'pending' }), word('along', { triage: 'known' })]
const cards = [
  card('let it slide', 'R', State.New), card('let it slide', 'C', State.New, 0),
  card('figure out', 'R', State.Review), card('figure out', 'C', State.Review),
  card("ain't", 'R', State.Learning), card("ain't", 'C', State.New, 0),
  card('hold on', 'R', State.Review),
  { ...card('wander', 'R', State.Review), itemType: 'word' as const },
]
const data = { songs, chunks, words, cards }
const ids = (f: LexFilter = {}) => lexicon(data, f).map((e) => e.id)

describe('lessico', () => {
  test('voci: chunk e parole, senza le parole già note; stato di ciascuna', () => {
    const byId = Object.fromEntries(lexicon(data, {}).map((e) => [e.id, e]))
    expect(Object.keys(byId).sort()).toEqual(["ain't", 'drift', 'figure out', 'hold on', 'let it slide', 'wander'].sort())
    expect(byId['let it slide'].status).toBe('nuovo')
    expect(byId['figure out'].status).toBe('attivo')
    expect(byId["ain't"].status).toBe('impara')
    expect(byId['hold on'].status).toBe('sospeso')
    expect(byId['drift'].status).toBe('da smistare')
    expect(byId['wander'].status).toBe('impara')
  })
  test('dove compare: titolo della canzone, oppure quante canzoni', () => {
    const byId = Object.fromEntries(lexicon(data, {}).map((e) => [e.id, e]))
    expect(byId['let it slide'].where).toBe('Lantern Road')
    expect(byId['figure out'].where).toBe('2 canzoni')
  })
  test('ricerca in inglese e in italiano, senza badare a maiuscole e accenti', () => {
    expect(ids({ q: 'FIGURE' })).toEqual(['figure out'])
    expect(ids({ q: 'risolvere' })).toEqual(['figure out'])
    expect(ids({ q: 'parola wand' })).toEqual(['wander'])
  })
  test('filtri: livello, attivi, solo canzone, parole, tema', () => {
    expect(ids({ chip: 'B1' }).sort()).toEqual(['drift', 'figure out', 'wander'])
    expect(ids({ chip: 'attivi' })).toEqual(['figure out'])
    expect(ids({ chip: 'solo canzone' })).toEqual(["ain't"])
    expect(ids({ chip: 'parole' }).sort()).toEqual(['drift', 'wander'])
    expect(ids({ topic: 'travel' })).toEqual(['wander'])
  })
  test('ordine: prima i chunk, poi le parole, ciascuno in ordine alfabetico', () => {
    expect(ids()).toEqual(["ain't", 'figure out', 'hold on', 'let it slide', 'drift', 'wander'])
  })
  test('aree scoperte: temi con meno voci attive o in studio, e i più coperti', () => {
    const c = coverage(lexicon(data, {}))
    expect(c.find((t) => t.topic === 'emotions')!.count).toBe(2) // let it slide e figure out; hold on è sospesa
    expect(c[0].count).toBeLessThanOrEqual(c[c.length - 1].count)
    expect(c.some((t) => t.topic === 'health' && t.count === 0)).toBe(true)
  })
})
