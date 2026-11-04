import { beforeEach, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { analyzeSong, createSong, saveAnalysis } from '../../src/domain/ingest'
import { buildUserMessage } from '../../src/domain/gemini/prompt'
import { finalListenDue } from '../../src/domain/finalListen'
import { saveSettings } from '../../src/domain/settings'
import type { Analysis } from '../../src/domain/gemini/parse'
import fixtureJson from '../fixtures/analysis.json'

const now = new Date('2026-11-04T10:00:00Z')
const analysis = fixtureJson as Analysis
const ranks = new Map([['flicker', 6000], ['wander', 3000], ['shadow', 4000]])
const text = { title: 'Episodio 3', artist: '', spotifyUrl: null, rawText: 'We dropped the ball on this one.\nNow we scramble.', comprehensionBefore: null }
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('un testo libero si salva come testo, con la sua fonte', async () => {
  const t = await createSong(db, { ...text, kind: 'text', source: 'serie' }, now)
  expect(await db.songs.get(t.id)).toMatchObject({ kind: 'text', source: 'serie', title: 'Episodio 3' })
  const s = await createSong(db, { ...text, title: 'Canzone' }, now)
  expect((await db.songs.get(s.id))!.kind).toBe('song')
})

test('a Gemini si dice che è un testo libero, non una canzone', () => {
  const m = buildUserMessage({ level: 'B2', band: [3000, 8000], known: [], lines: ['a'], kind: 'text' })
  expect(m).toContain('Tipo: testo libero (non una canzone): niente parlato connesso.')
  expect(buildUserMessage({ level: 'B2', band: [3000, 8000], known: [], lines: ['a'] })).toContain('Tipo: canzone')
})

test('un testo libero non salva parlato connesso e non ha riascolto finale', async () => {
  const t = await createSong(db, { ...text, kind: 'text', source: 'podcast' }, now)
  await saveAnalysis(db, t.id, { ...analysis, connected_speech: [{ line_index: 0, written: 'drop the', sung: 'drop da', note_it: 'x' }] }, ranks, now)
  const saved = (await db.songs.get(t.id))!
  expect(saved.connectedSpeech).toEqual([])
  await db.songs.update(t.id, { status: 'studying', studyStartedAt: new Date(now.getTime() - 30 * 86400000) })
  expect(finalListenDue([(await db.songs.get(t.id))!], now)).toEqual([])
})

test('l\'analisi di un testo manda il tipo giusto', async () => {
  await saveSettings(db, { apiKey: 'k' })
  const t = await createSong(db, { ...text, kind: 'text', source: 'articolo' }, now)
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] })))
  await analyzeSong(db, t.id, { fetch: f as unknown as typeof fetch, sleep: async () => {}, now, ranks, online: true })
  const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)
  expect(JSON.stringify(body)).toContain('Tipo: testo libero')
})
