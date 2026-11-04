import { beforeEach, expect, test, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { askGemini } from '../../src/domain/ask'
import { getSettings, saveSettings } from '../../src/domain/settings'
import { newFsrsCard, recordReview } from '../../src/domain/scheduler'
import type { Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const song = (id: string, over: Partial<Song> = {}): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['we glide along', 'and glide again'], status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now, ...over })
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('Chiedi a Gemini: una voce che c\'era già, segnata in due versi, conta una volta sola', async () => {
  await saveSettings(db, { apiKey: 'k' })
  await db.songs.add(song('s1'))
  const glide: Word = { id: 'g', lemma: 'glide', surfaceForm: 'glide', pos: 'verb', freqRank: 9000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }, { songId: 's1', lineIndex: 1 }],
    cefr: 'B2', register: 'usable', topic: 'other', meaningIt: 'scivolare', explanationIt: '', extraExampleEn: '', triage: 'known', userEdited: false, suspended: false }
  await db.words.add(glide)
  const w = (line: number) => ({ lemma: 'glide', surface_form: 'glide', line_index: line, pos: 'verb', cefr: 'B2', register: 'usable', topic: 'other', meaning_it: 'scivolare', explanation_it: '', extra_example_en: '' })
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ chunks: [], words: [w(0), w(1)], line_translations: [] }) }] } }] })))
  expect(await askGemini(db, 's1', [{ lineIndex: 0, text: 'glide' }, { lineIndex: 1, text: 'glide' }], { fetch: f as unknown as typeof fetch, sleep: async () => {}, now })).toEqual({ added: 0, existing: 1 })
})

test('la fascia ricorda se viene dal test di vocabolario; cambiare livello la riporta al livello', async () => {
  await saveSettings(db, { level: 'B2' })
  expect((await getSettings(db)).bandFromTest).toBeFalsy()
  await saveSettings(db, { bandStart: 3000, bandEnd: 8000, bandFromTest: true })
  expect((await getSettings(db)).bandFromTest).toBe(true)
  await saveSettings(db, { level: 'C1' })
  expect((await getSettings(db)).bandFromTest).toBe(false)
})

test('niente card Ascolta per un chunk la cui casa è un testo libero', async () => {
  await db.songs.add(song('t', { kind: 'text', source: 'serie' }))
  const c: Chunk = { id: 'c', songId: 't', key: 'glide along', baseForm: 'glide along', surfaceForm: 'glide along', lineIndex: 0, contexts: [{ songId: 't', lineIndex: 0 }],
    type: 'collocation', cefr: 'B2', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', productionPromptIt: '',
    pronunciationNoteIt: 'nata in una canzone', userEdited: false, suspended: false }
  await db.chunks.add(c)
  const fsrs = { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 3, last_review: new Date('2026-10-30T10:00:00Z'), due: now }
  await db.cards.add({ id: 'k', itemType: 'chunk', itemId: 'c', kind: 'C', unlocked: 1, due: now, fsrs, goodRCount: 2 })
  await recordReview(db, 'k', { rating: 3, auto: false, answer: null, elapsedMs: 1000 }, now, 0.9)
  expect(await db.cards.where('itemId').equals('c').filter((x) => x.kind === 'A').count()).toBe(0)
})

test('la fascia dal test sopravvive a esportazione e importazione del backup', async () => {
  const { exportBackup, importBackup } = await import('../../src/domain/backup')
  await saveSettings(db, { bandStart: 3000, bandEnd: 8000, bandFromTest: true })
  const file = JSON.parse(JSON.stringify(await exportBackup(db, now)))
  await importBackup(db, file)
  expect((await getSettings(db)).bandFromTest).toBe(true)
})

test('Chiedi a Gemini su una canzone eliminata durante la chiamata: nessuna voce orfana', async () => {
  await saveSettings(db, { apiKey: 'k' })
  await db.songs.add(song('s1'))
  const w = { lemma: 'glide', surface_form: 'glide', line_index: 0, pos: 'verb', cefr: 'B2', register: 'usable', topic: 'other', meaning_it: 'scivolare', explanation_it: '', extra_example_en: '' }
  const f = vi.fn(async () => {
    await db.songs.delete('s1') // eliminata mentre Gemini risponde
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ chunks: [], words: [w], line_translations: [] }) }] } }] }))
  })
  await expect(askGemini(db, 's1', [{ lineIndex: 0, text: 'glide' }], { fetch: f as unknown as typeof fetch, sleep: async () => {}, now })).rejects.toThrow()
  expect(await db.words.count()).toBe(0)
  expect(await db.cards.count()).toBe(0)
})

test('una parola sospesa che torna nel profilo (Escludi, Elimina canzone) non resta sospesa', async () => {
  const { excludeItem, deleteSong } = await import('../../src/domain/ingest')
  await db.songs.add(song('s1'))
  const base: Word = { id: 'a', lemma: 'a', surfaceForm: 'a', pos: 'verb', freqRank: 1, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: true, wasKnown: true }
  await db.words.bulkAdd([base, { ...base, id: 'b', lemma: 'b', surfaceForm: 'b' }])
  await excludeItem(db, 'a')
  expect(await db.words.get('a')).toMatchObject({ triage: 'known', suspended: false })
  await deleteSong(db, 's1')
  expect(await db.words.get('b')).toMatchObject({ triage: 'known', suspended: false })
})
