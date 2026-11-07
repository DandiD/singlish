import { beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { createSong, saveAnalysis, deleteSong } from '../../src/domain/ingest'
import { askGemini, defaultKeep, keepAnswers } from '../../src/domain/askDraft'
import { saveSettings } from '../../src/domain/settings'
import type { Analysis } from '../../src/domain/gemini/parse'
import type { Word } from '../../src/db/types'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00')
const analysis = fixtureJson as Analysis
const ranks = new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]])
const profile = (lemma: string): Word => ({ id: lemma, lemma, surfaceForm: lemma, pos: 'verb', freqRank: 1, songId: 'gone', lineIndex: 7, contexts: [],
  cefr: 'B2', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'known', userEdited: false, suspended: false })
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { apiKey: 'k', level: 'B2' }) })

test('una parola del profilo che ricompare in una canzone prende canzone e riga di quel verso', async () => {
  await db.words.add(profile('wander'))
  const b = await createSong(db, { title: 'B', artist: '', spotifyUrl: null, rawText: Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'), comprehensionBefore: null }, now)
  await saveAnalysis(db, b.id, analysis, ranks, now)
  const w = (await db.words.get('wander'))!
  expect(w.songId).toBe(b.id)
  expect(w.lineIndex).toBe(w.contexts[0].lineIndex)
})

test('una parola nota passata in studio e mai ripassata, eliminata la canzone, torna nel profilo', async () => {
  const b = await createSong(db, { title: 'B', artist: '', spotifyUrl: null, rawText: 'we wander home', comprehensionBefore: null }, now)
  await db.songs.update(b.id, { status: 'studying' })
  await db.words.add(profile('wander'))
  const answer = { answers: [{ id: 'w1', translation_it: 'vagare a casa', verse: null, item: { item_type: 'word', base_form: 'wander', surface_form: 'wander', widened: false, type: 'verb', cefr: 'B2', register: 'usable', topic: 'other', meaning_it: 'x', explanation_it: '', extra_example_en: '', production_prompt_it: '' } }] }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
  const draft = await askGemini(db, b.id, [{ id: 'w1', lineIndex: 0, text: 'wander' }], { fetch: f as unknown as typeof fetch, sleep: async () => {} })
  await keepAnswers(db, b.id, defaultKeep(draft), now)
  expect((await db.words.get('wander'))!).toMatchObject({ triage: 'learn', songId: b.id })
  await deleteSong(db, b.id)
  expect((await db.words.get('wander'))?.triage).toBe('known')
})
