import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import type { CardRow, Chunk, Review, Song } from '../../src/db/types'
import { MILESTONE_ORDER, markMilestoneSeen, reachedMilestones, seedMilestonesSeen } from '../../src/domain/milestones'
import { newFsrsCard } from '../../src/domain/scheduler'
import { getSettings, saveSettings } from '../../src/domain/settings'

const now = new Date(2026, 10, 4, 10) // mer 4 nov 2026
let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { db.close() })

const song = (id: string, over: Partial<Song> = {}): Song => ({
  id, kind: 'song', title: 'Title ' + id, artist: '', spotifyUrl: null, lines: ['one', 'two'], status: 'studying', level: 'B1',
  difficultyKnownPct: null, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [],
  addedAt: new Date(2026, 0, 1 + Number(id.replace(/\D/g, '') || 0)), analyzedAt: null, ...over,
})
const chunk = (id: string, songId = 's1', lineIndex = 0, over: Partial<Chunk> = {}): Chunk => ({
  id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex, contexts: [{ songId, lineIndex }], type: 'idiom', cefr: 'B1',
  register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false, ...over,
})
const card = (itemId: string, kind: 'R' | 'C', state: State = State.Review): CardRow => ({
  id: itemId + kind, itemType: 'chunk', itemId, kind, unlocked: 1, due: now, fsrs: { ...newFsrsCard(now), state, due: now }, goodRCount: 2,
})
const ids = async () => (await reachedMilestones(db, now)).map((m) => m.id)

/** n voci attive (card C in Review, sbloccata) di livello B1, tutte nella canzone s9 (non conta per le altre condizioni). */
async function addActive(n: number) {
  await db.chunks.bulkPut(Array.from({ length: n }, (_, i) => chunk(`a${i}`, 's9', 0)))
  await db.cards.bulkPut(Array.from({ length: n }, (_, i) => card(`a${i}`, 'C')))
}
const rev = (i: number, at: Date): Review => ({ id: 'r' + i, cardId: 'x', rating: 3, auto: false, answer: null, elapsedMs: 1, reviewedAt: at, wasNew: false })

describe('reachedMilestones', () => {
  test('nothing on an empty database', async () => {
    expect(await ids()).toEqual([])
  })

  test('order constant lists the eight ids of D7', () => {
    expect(MILESTONE_ORDER).toEqual(['song-all-unlocked', 'final-gain-20', 'active-50', 'active-150', 'active-500', 'week-goal', 'week-goal-4', 'level-up'])
  })

  test('song-all-unlocked: every line with items in Review', async () => {
    await db.songs.add(song('s1'))
    await db.chunks.bulkAdd([chunk('a', 's1', 0), chunk('b', 's1', 1)])
    await db.cards.bulkAdd([card('a', 'R'), card('b', 'R', State.Learning)])
    expect(await ids()).not.toContain('song-all-unlocked')
    await db.cards.put(card('b', 'R'))
    const m = (await reachedMilestones(db, now)).find((x) => x.id === 'song-all-unlocked')!
    expect(m.title).toBe('Una canzone tutta capita')
    expect(m.text).toBe('Tutti i versi di «Title s1» sono sbloccati.')
  })

  test('song-all-unlocked uses the oldest song that qualifies; a song with no lines with items does not qualify', async () => {
    await db.songs.bulkAdd([song('s2'), song('s1'), song('s3')])
    await db.chunks.bulkAdd([chunk('a', 's1', 0), chunk('b', 's2', 0)])
    await db.cards.bulkAdd([card('a', 'R'), card('b', 'R')])
    const m = (await reachedMilestones(db, now)).find((x) => x.id === 'song-all-unlocked')!
    expect(m.text).toBe('Tutti i versi di «Title s1» sono sbloccati.')
  })

  test.each([[19, false], [20, true]])('final-gain-20: gain %i -> %s', async (gain, yes) => {
    await db.songs.add(song('s1', { comprehensionBefore: 40, comprehensionAfter: 40 + gain }))
    const got = (await reachedMilestones(db, now)).find((x) => x.id === 'final-gain-20')
    expect(!!got).toBe(yes)
    if (got) {
      expect(got.title).toBe('Venti punti in più')
      expect(got.text).toBe('Al riascolto finale di «Title s1» hai capito 20 punti in più.')
    }
  })

  test('final-gain-20 ignores songs without both values', async () => {
    await db.songs.add(song('s1', { comprehensionBefore: null, comprehensionAfter: 90 }))
    await db.songs.add(song('s2', { comprehensionBefore: 10, comprehensionAfter: null }))
    expect(await ids()).not.toContain('final-gain-20')
  })

  test.each([[49, []], [50, ['active-50']], [149, ['active-50']], [150, ['active-50', 'active-150']]])('active voices %i', async (n, want) => {
    await addActive(n)
    expect((await ids()).filter((i) => i.startsWith('active-'))).toEqual(want)
  })

  test('active-500 title and text', async () => {
    await addActive(500)
    const all = await reachedMilestones(db, now)
    expect(all.map((m) => m.id)).toEqual(expect.arrayContaining(['active-50', 'active-150', 'active-500']))
    const m = all.find((x) => x.id === 'active-500')!
    expect(m.title).toBe('500 voci attive')
    expect(m.text).toBe('Le usi senza aiuto: le riconosci e le completi.')
  })

  test('week-goal counts reviews and free days against the current goal', async () => {
    await saveSettings(db, { rhythmGoal: 3, freeDays: [] })
    await db.reviews.bulkAdd([rev(1, new Date(2026, 9, 26, 9)), rev(2, new Date(2026, 9, 27, 9))])
    expect(await ids()).not.toContain('week-goal')
    await saveSettings(db, { freeDays: ['2026-10-28'] })
    const m = (await reachedMilestones(db, now)).find((x) => x.id === 'week-goal')!
    expect(m.title).toBe('Una settimana a ritmo')
    expect(m.text).toBe("Hai raggiunto l'obiettivo della settimana.")
  })

  test('week-goal lost after the goal is raised', async () => {
    await saveSettings(db, { rhythmGoal: 3, freeDays: ['2026-10-26', '2026-10-27', '2026-10-28'] })
    expect(await ids()).toContain('week-goal')
    await saveSettings(db, { rhythmGoal: 4 })
    expect(await ids()).not.toContain('week-goal')
  })

  test('week-goal-4 needs four consecutive weeks', async () => {
    const free = (w: number) => [0, 1, 2].map((d) => { const x = new Date(2026, 9, 5 + 7 * w + d); return `2026-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` })
    await saveSettings(db, { rhythmGoal: 3, freeDays: [...free(0), ...free(1), ...free(3)] })
    expect(await ids()).toContain('week-goal')
    expect(await ids()).not.toContain('week-goal-4')
    await saveSettings(db, { freeDays: [...free(0), ...free(1), ...free(2), ...free(3)] })
    const m = (await reachedMilestones(db, now)).find((x) => x.id === 'week-goal-4')!
    expect(m.title).toBe('Quattro settimane di fila')
    expect(m.text).toBe('Quattro settimane a ritmo, una dopo l\'altra.')
  })

  test('level-up: 150 active at level and comprehension 70, next level named', async () => {
    await addActive(150)
    await db.songs.add(song('s1', { comprehensionBefore: 69 }))
    expect(await ids()).not.toContain('level-up')
    await db.songs.update('s1', { comprehensionBefore: 70 })
    const m = (await reachedMilestones(db, now)).find((x) => x.id === 'level-up')!
    expect(m.title).toBe('Pronto per il B2')
    expect(m.text).toBe('Puoi alzare il livello nelle Impostazioni.')
  })

  test('level-up needs 150 at the current level (149 is not enough) and a next level (C1 has none)', async () => {
    await addActive(149)
    await db.songs.add(song('s1', { comprehensionBefore: 80 }))
    expect(await ids()).not.toContain('level-up')
    await addActive(150)
    await saveSettings(db, { level: 'C1' })
    expect(await ids()).not.toContain('level-up')
  })

  test('results follow MILESTONE_ORDER', async () => {
    await addActive(150)
    await db.songs.add(song('s1', { comprehensionBefore: 40, comprehensionAfter: 70 }))
    const got = await ids()
    expect(got).toEqual(MILESTONE_ORDER.filter((i) => got.includes(i)))
    expect(got).toEqual(['final-gain-20', 'active-50', 'active-150'])
  })
})

describe('seen state', () => {
  test('markMilestoneSeen saves the date and keeps the others', async () => {
    await markMilestoneSeen(db, 'active-50', now)
    const later = new Date(2026, 10, 5)
    await markMilestoneSeen(db, 'week-goal', later)
    expect((await getSettings(db)).milestonesSeen).toEqual({ 'active-50': now, 'week-goal': later })
  })

  test('markMilestoneSeen does not overwrite an earlier date', async () => {
    await markMilestoneSeen(db, 'active-50', now)
    await markMilestoneSeen(db, 'active-50', new Date(2026, 10, 9))
    expect((await getSettings(db)).milestonesSeen!['active-50']).toEqual(now)
  })

  test('seed marks reached milestones as seen today, only when the field is missing', async () => {
    await addActive(50)
    expect(await seedMilestonesSeen(db, now)).toBe(true)
    expect((await getSettings(db)).milestonesSeen).toEqual({ 'active-50': now })
    await addActive(150)
    expect(await seedMilestonesSeen(db, new Date(2026, 10, 9))).toBe(false)
    expect((await getSettings(db)).milestonesSeen).toEqual({ 'active-50': now })
  })

  test('seed with nothing reached writes an empty object (seeded, none seen)', async () => {
    expect(await seedMilestonesSeen(db, now)).toBe(true)
    expect((await getSettings(db)).milestonesSeen).toEqual({})
    expect(await seedMilestonesSeen(db, now)).toBe(false)
  })

  test('a milestone seen and then lost stays in milestonesSeen with its date', async () => {
    await saveSettings(db, { rhythmGoal: 3, freeDays: ['2026-10-26', '2026-10-27', '2026-10-28'] })
    await markMilestoneSeen(db, 'week-goal', now)
    await saveSettings(db, { rhythmGoal: 5 })
    expect(await ids()).not.toContain('week-goal')
    expect((await getSettings(db)).milestonesSeen).toEqual({ 'week-goal': now })
  })

  test('saveSettings keeps milestonesSeen when saving something else', async () => {
    await markMilestoneSeen(db, 'active-50', now)
    await saveSettings(db, { newPerDay: 10 })
    expect((await getSettings(db)).milestonesSeen).toEqual({ 'active-50': now })
  })
})
