import { beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { createSong, saveAnalysis } from '../../src/domain/ingest'
import { requestExpansion, addExpansion, expansionPlan } from '../../src/domain/expand'
import { askGemini } from '../../src/domain/ask'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair } from '../../src/domain/scheduler'
import type { Analysis } from '../../src/domain/gemini/parse'
import type { Song, Word } from '../../src/db/types'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00Z')
const analysis = fixtureJson as Analysis
const songA: Song = { id: 'A', kind: 'song', title: 'A', artist: '', spotifyUrl: null, lines: ['we rely on it'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 3000, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
const reply = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] })))
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { apiKey: 'k' }); await db.songs.add(songA) })

test('la voce di Espandi che riceve un verso passa alla canzone, alla riga e alla forma di quel verso', async () => {
  await db.words.add(word('rely')); await db.cards.bulkAdd(newCardPair('word', 'rely', now))
  await requestExpansion(db, 'rely', { fetch: reply({ family: [{ lemma: 'flicker', pos: 'noun', meaning_it: 'x', example_en: 'x' }], collocations: [], opposites: [], nuance: null }) as unknown as typeof fetch, sleep: async () => {} })
  await addExpansion(db, 'rely', { family: ['flicker'], collocations: [], opposites: [], nuance: false }, now)
  const b = await createSong(db, { title: 'B', artist: '', spotifyUrl: null, rawText: Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'), comprehensionBefore: null }, now)
  await saveAnalysis(db, b.id, analysis, new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]]), now)
  const fl = (await db.words.where('lemma').equals('flicker').first())!
  const ctx = fl.contexts.find((x) => x.songId === b.id)!
  expect(fl).toMatchObject({ songId: b.id, lineIndex: ctx.lineIndex })
})

test('una parola che passa in studio riceve R e C anche se aveva già un\'altra card', async () => {
  await db.words.add(word('scramble', { triage: 'known' }))
  await db.cards.add({ ...newCardPair('word', 'scramble', now)[0], id: 's1', kind: 'S' })
  const answer = { chunks: [], words: [{ lemma: 'scramble', surface_form: 'rely', line_index: 0, pos: 'verb', cefr: 'B1', register: 'usable', topic: 'other', meaning_it: 'x', explanation_it: '', extra_example_en: '' }], line_translations: [] }
  await askGemini(db, 'A', [{ lineIndex: 0, text: 'rely' }], { fetch: reply(answer) as unknown as typeof fetch, sleep: async () => {}, now })
  const kinds = (await db.cards.where('itemId').equals('scramble').toArray()).map((c) => c.kind).sort()
  expect(kinds).toEqual(['C', 'R', 'S'])
})

test('Espandi: una parola nota che ha solo la card S riceve R e C, e l\'annuncio le conta', async () => {
  await db.words.add(word('rely', { expansion: { family: [{ lemma: 'known-one', pos: 'noun', meaning_it: 'x', example_en: 'x' }], collocations: [], opposites: [], nuance: null } }))
  await db.words.add(word('known-one', { triage: 'known' }))
  await db.cards.add({ ...newCardPair('word', 'known-one', now)[0], id: 'k-s', kind: 'S' })
  const pick = { family: ['known-one'], collocations: [], opposites: [], nuance: false }
  const plan = expansionPlan(await db.words.toArray(), [], (await db.words.get('rely'))!, pick, await db.cards.toArray())
  expect(plan.cards).toBe(2)
  await addExpansion(db, 'rely', pick, now)
  expect((await db.cards.where('itemId').equals('known-one').toArray()).map((c) => c.kind).sort()).toEqual(['C', 'R', 'S'])
})
