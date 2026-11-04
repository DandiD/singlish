import { beforeEach, expect, test, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { buildSessionQueue } from '../../src/domain/queue'
import { expansionPlan } from '../../src/domain/expand'
import { askGemini } from '../../src/domain/ask'
import { saveProduction, confirmProductions } from '../../src/domain/production'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import type { Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const song = (id: string, status: Song['status']): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['we rely on it'], status, level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now })
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: 'x', triage: 'learn', userEdited: false, suspended: false, ...over })
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { apiKey: 'k' }) })

test('le voci di Espandi entrano in coda se la parola madre è in una canzone in studio, anche se la sua canzone d\'origine è da studiare', async () => {
  await db.songs.bulkAdd([song('A', 'analyzed'), song('B', 'studying')])
  await db.words.add(word('rely', { contexts: [{ songId: 'A', lineIndex: 0 }, { songId: 'B', lineIndex: 0 }] }))
  await db.words.add(word('reliable', { contexts: [], origin: 'expand', fromItemId: 'rely' }))
  await db.cards.bulkAdd([...newCardPair('word', 'rely', now), ...newCardPair('word', 'reliable', now)])
  const q = await buildSessionQueue(db, now)
  expect(q.items.map((i) => i.card.itemId)).toContain('reliable')
})

test('due collocazioni uguali a meno di maiuscole diventano un solo chunk', () => {
  const w = word('rely', { expansion: { family: [], opposites: [], nuance: null, collocations: [
    { base_form: "rely on", meaning_it: 'x', example_en: 'x' }, { base_form: 'Rely On', meaning_it: 'x', example_en: 'x' }] } })
  expect(expansionPlan([w], [], w, { family: [], collocations: ['rely on', 'Rely On'], opposites: [], nuance: false }).newChunks).toHaveLength(1)
})

test('chiedere a Gemini una voce sospesa la riattiva: l\'hai scelta tu', async () => {
  await db.songs.add(song('A', 'studying'))
  await db.words.add(word('rely', { suspended: true }))
  const answer = { chunks: [], words: [{ lemma: 'rely', surface_form: 'rely', line_index: 0, pos: 'verb', cefr: 'B1', register: 'usable', topic: 'other', meaning_it: 'x', explanation_it: '', extra_example_en: '' }], line_translations: [] }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
  await askGemini(db, 'A', [{ lineIndex: 0, text: 'rely' }], { fetch: f as unknown as typeof fetch, sleep: async () => {}, now })
  expect((await db.words.get('rely'))!.suspended).toBe(false)
})

test('una frase confermata conta fra i ripassi della sua sessione', async () => {
  await db.songs.add(song('A', 'studying'))
  await db.chunks.add({ id: 'c1', songId: 'A', key: 'k', baseForm: 'rely on', surfaceForm: 'rely on', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }], type: 'collocation',
    cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: 'x', pronunciationNoteIt: '', userEdited: false, suspended: false })
  await db.cards.add({ id: 'p1', itemType: 'chunk', itemId: 'c1', kind: 'P', unlocked: 1, due: now, fsrs: { ...newFsrsCard(now), state: State.Review, stability: 3, difficulty: 5, reps: 2 }, goodRCount: 0 })
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: null, timer: { status: 'paused', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 2, newDone: 1 })
  await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'We rely on it.', elapsedMs: 1 })
  await confirmProductions(db, [{ sessionId: 'r1', cardId: 'p1', sentence: 'We rely on it.', elapsedMs: 1, rating: 3 }], now, 0.9)
  expect((await db.sessions.get('r1'))!.reviewsDone).toBe(3)
})
