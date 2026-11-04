import { beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { createSong, saveAnalysis, deleteSong, excludeItem } from '../../src/domain/ingest'
import { requestExpansion, addExpansion, expansionPlan } from '../../src/domain/expand'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair } from '../../src/domain/scheduler'
import type { Analysis } from '../../src/domain/gemini/parse'
import type { Song, Word } from '../../src/db/types'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00Z')
const analysis = fixtureJson as Analysis
const songA: Song = { id: 'A', kind: 'song', title: 'A', artist: '', spotifyUrl: null, lines: ['we rely on it'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const rely: Word = { id: 'rely', lemma: 'rely', surfaceForm: 'rely', pos: 'verb', freqRank: 3000, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'contare su', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false }
const expansion = { family: [{ lemma: 'flicker', pos: 'noun', meaning_it: 'tremolio', example_en: 'A flicker of hope.' }], collocations: [], opposites: [], nuance: null }
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await saveSettings(db, { apiKey: 'k' })
  await db.songs.add(songA); await db.words.add(rely); await db.cards.bulkAdd(newCardPair('word', 'rely', now))
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expansion) }] } }] })))
  await requestExpansion(db, 'rely', { fetch: f as unknown as typeof fetch, sleep: async () => {} })
  await addExpansion(db, 'rely', { family: ['flicker'], collocations: [], opposites: [], nuance: false }, now)
})

test('una voce di Espandi che compare in una canzone analizzata dopo diventa voce di quella canzone', async () => {
  const b = await createSong(db, { title: 'B', artist: '', spotifyUrl: null, rawText: Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'), comprehensionBefore: null }, now)
  await saveAnalysis(db, b.id, analysis, new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]]), now)
  const flicker = (await db.words.where('lemma').equals('flicker').first())!
  expect(flicker.origin).toBeUndefined()
  expect(flicker.fromItemId).toBeUndefined()
  expect(flicker.contexts.some((x) => x.songId === b.id)).toBe(true)
  // eliminando A (e con lei «rely»), «flicker» resta: compare in B
  await deleteSong(db, 'A')
  expect(await db.words.where('lemma').equals('flicker').count()).toBe(1)
})

test('escludere una parola fa uscire anche le voci nate da lei con Espandi', async () => {
  const removed = await excludeItem(db, 'rely')
  expect(removed).toEqual({ children: 1 })
  expect(await db.words.count()).toBe(0)
  expect(await db.cards.count()).toBe(0)
})

test('Espandi non conta le card di una parola sospesa (resterebbero fuori dal ripasso)', async () => {
  await db.words.add({ ...rely, id: 'w2', lemma: 'reliance', triage: 'pending', suspended: true })
  const word = (await db.words.get('rely'))!
  const plan = expansionPlan(await db.words.toArray(), [], { ...word, expansion: { ...expansion, family: [{ ...expansion.family[0], lemma: 'reliance' }] } },
    { family: ['reliance'], collocations: [], opposites: [], nuance: false })
  expect(plan.cards).toBe(0)
})
