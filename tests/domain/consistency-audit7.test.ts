import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { deleteSong, saveAnalysis, createSong } from '../../src/domain/ingest'
import { buildSessionQueue } from '../../src/domain/queue'
import { effectiveNewPerDay } from '../../src/domain/readiness'
import { saveProduction } from '../../src/domain/production'
import { saveSettings, DEFAULT_SETTINGS } from '../../src/domain/settings'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'
import type { Analysis } from '../../src/domain/gemini/parse'
import type { Song, Word } from '../../src/db/types'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00')
const analysis = fixtureJson as Analysis
const ranks = new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]])
const songA: Song = { id: 'A', kind: 'song', title: 'A', artist: '', spotifyUrl: null, lines: ['x'], status: 'done', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const word = (lemma: string, triage: Word['triage']): Word => ({ id: lemma, lemma, surfaceForm: lemma, pos: 'verb', freqRank: 3000, songId: 'A', lineIndex: 0,
  contexts: [{ songId: 'A', lineIndex: 0 }], cefr: 'B2', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage, userEdited: false, suspended: false })
let db: SinglishDB
beforeEach(async () => { db = createDb('t-' + crypto.randomUUID()); await saveSettings(db, { level: 'B2' }); await db.songs.add(songA) })

test('eliminata la canzone, le parole «La so» e quelle già studiate restano nel profilo e non tornano in Smista', async () => {
  await db.words.bulkAdd([word('wander', 'known'), word('shadow', 'learn')])
  await db.cards.bulkAdd(newCardPair('word', 'shadow', now))
  await db.reviews.add({ id: 'r', cardId: (await db.cards.where('itemId').equals('shadow').first())!.id, rating: 3, auto: false, answer: null, elapsedMs: 1, reviewedAt: now, wasNew: true })
  await deleteSong(db, 'A')
  expect((await db.words.toArray()).map((w) => [w.lemma, w.triage]).sort()).toEqual([['shadow', 'known'], ['wander', 'known']])
  expect(await db.cards.count()).toBe(0)
  const b = await createSong(db, { title: 'B', artist: '', spotifyUrl: null, rawText: Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'), comprehensionBefore: null }, now)
  await saveAnalysis(db, b.id, analysis, ranks, now)
  const pending = (await db.words.toArray()).filter((w) => w.triage === 'pending').map((w) => w.lemma)
  expect(pending).not.toContain('wander')
  expect(pending).not.toContain('shadow')
})

test('una parola da imparare mai ripassata, eliminata la canzone, esce del tutto', async () => {
  await db.words.add(word('flicker', 'learn'))
  await db.cards.bulkAdd(newCardPair('word', 'flicker', now))
  await deleteSong(db, 'A')
  expect(await db.words.count()).toBe(0)
})

test('le nuove del giorno non contano le frasi di card che non ci sono più', async () => {
  await db.songs.update('A', { status: 'studying' })
  await saveSettings(db, { newPerDay: 3 })
  await db.sessions.add({ id: 'r1', kind: 'review', songId: null, startedAt: now, endedAt: now, timer: { status: 'stopped', durationMs: 1, accumulatedMs: 1, resumedAt: null }, reviewsDone: 0, newDone: 0 })
  await saveProduction(db, 'r1', { cardId: 'gone', itemId: 'gone', sentence: 'x', elapsedMs: 1, wasNew: true, at: now })
  for (const l of ['flicker', 'wander', 'shadow']) { await db.words.add(word(l, 'learn')); await db.cards.bulkAdd(newCardPair('word', l, now)) }
  expect((await buildSessionQueue(db, now)).newCount).toBe(3)
  expect(newFsrsCard(now)).toBeTruthy()
})

test('la modalità intensiva non abbassa mai le nuove al giorno scelte', () => {
  const s = { ...DEFAULT_SETTINGS, newPerDay: 30, intensiveUntil: new Date(now.getTime() + 864e5) }
  expect(effectiveNewPerDay(s, now)).toBe(30)
})
