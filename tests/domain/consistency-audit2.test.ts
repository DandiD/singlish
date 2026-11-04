import { beforeEach, describe, expect, test, vi } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { deleteSong } from '../../src/domain/ingest'
import { requestExpansion, addExpansion, expansionPlan } from '../../src/domain/expand'
import { recordReview, newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import { readiness } from '../../src/domain/readiness'
import { progressStats } from '../../src/domain/progress'
import { buildSessionQueue } from '../../src/domain/queue'
import { saveProduction, pendingProductions } from '../../src/domain/production'
import { saveSettings, DEFAULT_SETTINGS } from '../../src/domain/settings'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const song = (id: string, over: Partial<Song> = {}): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['gonna run on empty'], status: 'studying', level: 'B1',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [{ lineIndex: 0, written: 'going to', sung: 'gonna', noteIt: '' }], addedAt: now, analyzedAt: now, ...over })
const word = (id: string, songId: string, contexts: Word['contexts'], over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'adjective', freqRank: 2000, songId, lineIndex: 0,
  contexts, cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
const chunk = (id: string, songId: string, over: Partial<Chunk> = {}): Chunk => ({ id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex: 0, contexts: [{ songId, lineIndex: 0 }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: 'other', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: 'x', pronunciationNoteIt: '', userEdited: false, suspended: false, ...over })
const expansion = {
  family: [{ lemma: 'emptiness', pos: 'noun', meaning_it: 'vuoto', example_en: 'A feeling of emptiness.' }, { lemma: 'known-one', pos: 'noun', meaning_it: 'x', example_en: 'x' }],
  collocations: [{ base_form: 'empty promises', meaning_it: 'promesse vuote', example_en: 'No more empty promises.' }],
  opposites: [], nuance: null,
}
const reply = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expansion) }] } }] })))
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { apiKey: 'k' }) })

const expandEmpty = async () => {
  await db.songs.bulkAdd([song('A'), song('B')])
  await db.words.add(word('empty', 'A', [{ songId: 'A', lineIndex: 0 }, { songId: 'B', lineIndex: 0 }]))
  await requestExpansion(db, 'empty', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
  await addExpansion(db, 'empty', { family: ['emptiness'], collocations: ['empty promises'], opposites: [], nuance: false }, now)
}

describe('incoerenze delle funzioni nuove', () => {
  test('1. eliminata la canzone d\'origine, le voci di Espandi restano con la parola da cui sono nate', async () => {
    await expandEmpty()
    await deleteSong(db, 'A')
    expect((await db.words.toArray()).map((w) => w.lemma).sort()).toEqual(['emptiness', 'empty'])
    expect((await db.words.where('lemma').equals('emptiness').first())!.songId).toBe('B')
    expect(await db.chunks.count()).toBe(1)
  })
  test('1b. eliminata la parola d\'origine con la sua unica canzone, le sue voci di Espandi spariscono', async () => {
    await db.songs.add(song('A'))
    await db.words.add(word('empty', 'A', [{ songId: 'A', lineIndex: 0 }]))
    await requestExpansion(db, 'empty', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
    await addExpansion(db, 'empty', { family: ['emptiness'], collocations: [], opposites: [], nuance: false }, now)
    await deleteSong(db, 'A')
    expect(await db.words.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
  })
  test('2. una collocazione di Espandi non riceve la card Ascolta (non ha verso)', async () => {
    await db.songs.add(song('A'))
    await db.chunks.add(chunk('empty promises', 'A', { contexts: [], origin: 'expand' }))
    await db.cards.add({ id: 'k1', itemType: 'chunk', itemId: 'empty promises', kind: 'C', unlocked: 1, due: now,
      fsrs: { ...newFsrsCard(now), state: State.Review, stability: 3, difficulty: 5, reps: 3, last_review: new Date(now.getTime() - 3 * 864e5), due: now }, goodRCount: 2 })
    await recordReview(db, 'k1', { rating: 3, auto: true, answer: 'x', elapsedMs: 1 }, now, 0.9)
    expect(await db.cards.where('itemId').equals('empty promises').filter((c) => c.kind === 'A').count()).toBe(0)
  })
  test('3. lo sblocco conta le voci che lo Studio mostra: niente voci di Espandi', async () => {
    await expandEmpty()
    const cards = [...await db.cards.toArray()]
    for (const c of cards.filter((c) => c.itemId === 'empty')) await db.cards.update(c.id, { fsrs: { ...c.fsrs, state: State.Review } })
    const r = readiness({ settings: DEFAULT_SETTINGS, songs: await db.songs.toArray(), chunks: await db.chunks.toArray(), words: await db.words.toArray(), cards: await db.cards.toArray(), avgSeconds: 12 }, now)
    expect(r.notInReview).toEqual([])
  })
  test('4. i testi liberi vengono dopo le espansioni', async () => {
    await db.songs.bulkAdd([song('T', { kind: 'text', addedAt: new Date(now.getTime() - 9e8) }), song('S')])
    await db.chunks.bulkAdd([chunk('text-chunk', 'T'), chunk('song-chunk', 'S'), chunk('exp-chunk', 'S', { contexts: [], origin: 'expand' })])
    for (const id of ['text-chunk', 'song-chunk', 'exp-chunk']) await db.cards.bulkAdd(newCardPair('chunk', id, now))
    const q = await buildSessionQueue(db, now)
    expect(q.items.map((i) => i.card.itemId)).toEqual(['song-chunk', 'exp-chunk', 'text-chunk'])
  })
  test('5. Espandi annuncia esattamente le card che crea; una parola nota passa in studio', async () => {
    await db.songs.add(song('A'))
    await db.words.add(word('empty', 'A', [{ songId: 'A', lineIndex: 0 }]))
    await db.words.add(word('known-one', 'A', [{ songId: 'A', lineIndex: 0 }], { triage: 'known' }))
    await requestExpansion(db, 'empty', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
    const pick = { family: ['emptiness', 'known-one'], collocations: ['empty promises'], opposites: [], nuance: false }
    const plan = expansionPlan(await db.words.toArray(), await db.chunks.toArray(), (await db.words.get('empty'))!, pick)
    const before = await db.cards.count()
    await addExpansion(db, 'empty', pick, now)
    expect((await db.cards.count()) - before).toBe(plan.cards)
    expect(plan.cards).toBe(6)
    expect((await db.words.get('known-one'))!.triage).toBe('learn')
  })
  test('7. il carico dei 7 giorni conta una card per voce, come la sessione', async () => {
    await db.songs.add(song('A'))
    await db.chunks.add(chunk('c1', 'A'))
    const due = (kind: CardRow['kind']): CardRow => ({ id: 'c1' + kind, itemType: 'chunk', itemId: 'c1', kind, unlocked: 1, due: new Date(now.getTime() + 864e5),
      fsrs: { ...newFsrsCard(now), state: State.Review }, goodRCount: 0 })
    const cards = [due('R'), due('C'), due('P'), due('A')]
    const data = { settings: DEFAULT_SETTINGS, songs: await db.songs.toArray(), chunks: await db.chunks.toArray(), words: [], cards, avgSeconds: 60 }
    expect(progressStats({ ...data, reviews: [] }, now).loadMinutesPerDay).toBeCloseTo(1 / 7)
    expect(readiness(data, now).loadMinutesPerDay).toBeCloseTo(1 / 7)
  })
  test('8. la frase di un chunk sospeso non resta da correggere', async () => {
    await db.songs.add(song('A'))
    await db.chunks.add(chunk('c1', 'A', { suspended: true }))
    await db.cards.add({ ...newCardPair('chunk', 'c1', now)[0], id: 'p1', kind: 'P' })
    await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
    await saveProduction(db, 'r1', { cardId: 'p1', itemId: 'c1', sentence: 'x', elapsedMs: 1 })
    expect(await pendingProductions(db)).toEqual([])
  })
})
