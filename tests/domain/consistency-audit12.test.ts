import { beforeEach, expect, test } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { graduate, repairHomes } from '../../src/domain/ingest'
import { addExpansion, canExpand } from '../../src/domain/expand'
import { saveFinalListen } from '../../src/domain/finalListen'
import type { Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00')
const song = (id: string, over: Partial<Song> = {}): Song => ({ id, kind: 'song', title: id, artist: '', spotifyUrl: null, lines: ['a', 'b'], status: 'studying', level: 'B1', difficultyKnownPct: 70,
  comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now, ...over })
const word = (id: string, over: Partial<Word> = {}): Word => ({ id, lemma: id, surfaceForm: id, pos: 'verb', freqRank: 1, songId: 'A', lineIndex: 0, contexts: [{ songId: 'A', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'x', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false, ...over })
const expansion = { family: [{ lemma: 'emptiness', pos: 'noun', meaning_it: 'vuoto', example_en: 'A feeling of emptiness.' }], collocations: [], opposites: [], nuance: null }
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })

test('la casa di una voce è sempre il suo primo verso: la riparazione sposta anche una casa valida ma non prima, con la sua forma', async () => {
  await db.words.add(word('drift', { songId: 'A', lineIndex: 7, surfaceForm: 'drifts', contexts: [{ songId: 'B', lineIndex: 5, surfaceForm: 'drifted' }, { songId: 'A', lineIndex: 7 }] }))
  expect(await repairHomes(db)).toBe(1)
  const w = (await db.words.get('drift'))!
  expect(w).toMatchObject({ songId: 'B', lineIndex: 5, surfaceForm: 'drifted' })
  expect(w.contexts).toEqual([{ songId: 'B', lineIndex: 5 }, { songId: 'A', lineIndex: 7, surfaceForm: 'drifts' }])
})

test('graduate sposta anche una voce rimasta nella canzone giusta ma su una riga che non è il suo primo verso', () => {
  const w = word('w', { songId: 'A', lineIndex: 2, contexts: [{ songId: 'A', lineIndex: 7 }] })
  graduate(w)
  expect(w).toMatchObject({ songId: 'A', lineIndex: 7 })
})

test('Espandi vale solo per le parole in studio, attive e non nate da Espandi, anche aperto dall\'indirizzo', async () => {
  expect(canExpand(word('a'))).toBe(true)
  expect(canExpand(word('b', { suspended: true }))).toBe(false)
  expect(canExpand(word('c', { triage: 'pending' }))).toBe(false)
  expect(canExpand(word('d', { origin: 'expand', fromItemId: 'a' }))).toBe(false)
  await db.words.add(word('s', { suspended: true, expansion }))
  await expect(addExpansion(db, 's', { family: ['emptiness'], collocations: [], opposites: [], nuance: false } as never, now)).rejects.toThrow()
  expect(await db.words.count()).toBe(1)
  expect(await db.cards.count()).toBe(0)
})

test('il riascolto finale non riscrive una canzone già completata', async () => {
  await db.songs.add(song('done', { status: 'done', comprehensionAfter: 80, finalListenAt: now }))
  await saveFinalListen(db, 'done', 30, new Date('2026-11-10T10:00:00'))
  expect(await db.songs.get('done')).toMatchObject({ comprehensionAfter: 80, finalListenAt: now })
})
