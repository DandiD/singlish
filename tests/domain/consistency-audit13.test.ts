import { beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { createSong, excludeItem, saveAnalysis } from '../../src/domain/ingest'
import { askGemini } from '../../src/domain/ask'
import { newCardPair } from '../../src/domain/scheduler'
import { saveSettings } from '../../src/domain/settings'
import type { Analysis } from '../../src/domain/gemini/parse'
import type { Song, Word } from '../../src/db/types'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00Z')
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('escludere una parola che sapevi già la rimette nel profilo, come quando si esclude la sua parola d\'origine', async () => {
  await db.words.add(word('known', { wasKnown: true, origin: 'expand', fromItemId: 'p', contexts: [] }))
  await db.cards.bulkAdd(newCardPair('word', 'known', now))
  await excludeItem(db, 'known')
  expect(await db.words.get('known')).toMatchObject({ triage: 'known', contexts: [] })
  expect((await db.words.get('known'))!.origin).toBeUndefined()
  expect(await db.cards.count()).toBe(0)
})

test('un testo libero non salva note di pronuncia: niente card Ascolta né sezione Pronuncia', async () => {
  const t = await createSong(db, { title: 'Episodio', artist: '', spotifyUrl: null, rawText: 'We dropped the ball.\nNow we scramble.', comprehensionBefore: null, kind: 'text', source: 'serie' }, now)
  await saveAnalysis(db, t.id, fixtureJson as Analysis, new Map(), now)
  const chunks = await db.chunks.toArray()
  expect(chunks.length).toBeGreaterThan(0)
  expect(chunks.every((c) => c.pronunciationNoteIt === '')).toBe(true)
})

test('Chiedi a Gemini: una voce restituita due volte nella stessa risposta non conta come «c\'era già»; e su un testo niente pronuncia', async () => {
  await saveSettings(db, { apiKey: 'k' })
  const song: Song = { id: 's1', kind: 'text', source: 'serie', title: 'T', artist: '', spotifyUrl: null, lines: ['we drop the ball', 'they drop the ball again'], status: 'studying', level: 'B2',
    difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
  await db.songs.add(song)
  const c = (line: number) => ({ base_form: 'drop the ball', surface_form: 'drop the ball', line_index: line, type: 'idiom', cefr: 'B2', register: 'informal', topic: 'work',
    meaning_it: 'sbagliare', explanation_it: '', extra_example_en: '', production_prompt_it: '', pronunciation_note_it: 'suona dropthe' })
  const answer = { chunks: [c(0), c(1)], words: [], line_translations: [] }
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
  const r = await askGemini(db, 's1', [{ lineIndex: 0, text: 'drop the ball' }, { lineIndex: 1, text: 'drop the ball' }], { fetch: f as unknown as typeof fetch, sleep: async () => {}, now })
  expect(r).toEqual({ added: 1, existing: 0 })
  const [chunk] = await db.chunks.toArray()
  expect(chunk.contexts).toHaveLength(2)
  expect(chunk.pronunciationNoteIt).toBe('')
})
