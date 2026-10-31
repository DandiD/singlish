import { beforeEach, describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import type { CardRow, Chunk, Song, Word } from '../../src/db/types'
import {
  buildSessionQueue,
  DEFAULT_SECONDS_PER_REVIEW,
  estimateAvgSeconds,
  startOfLocalDay,
} from '../../src/domain/queue'
import { newCardPair, newFsrsCard } from '../../src/domain/scheduler'

const at = (iso: string) => new Date(iso)
const now = at('2026-10-31T12:00:00')
let db: SinglishDB
let veryLate: string
let late: string

function song(id: string, addedAt: Date): Song {
  return {
    id, kind: 'song', title: id, artist: 'a', spotifyUrl: null, lines: ['x'], status: 'studying',
    level: 'B1', difficultyKnownPct: null, comprehensionBefore: null, grammarPoint: null,
    connectedSpeech: [], addedAt, analyzedAt: null,
  }
}
function chunk(id: string, songId: string, lineIndex: number, suspended = false): Chunk {
  return {
    id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex, contexts: [], type: 'collocation',
    cefr: 'B1', register: 'usable', topic: 't', meaningIt: 'm', explanationIt: 'e', extraExampleEn: 'x',
    productionPromptIt: 'p', pronunciationNoteIt: '', userEdited: false, suspended,
  }
}
function word(id: string, songId: string, lineIndex: number, triage: Word['triage']): Word {
  return {
    id, lemma: id, surfaceForm: id, pos: 'noun', freqRank: 3000, songId, lineIndex, contexts: [],
    cefr: 'B1', register: 'usable', topic: 't', meaningIt: 'm', explanationIt: 'e', extraExampleEn: 'x',
    triage, userEdited: false, suspended: false,
  }
}
async function seedNewReviews(d: SinglishDB, n: number, when: Date) {
  await d.reviews.bulkAdd(
    Array.from({ length: n }, () => ({
      id: crypto.randomUUID(), cardId: 'x', rating: 3 as const, auto: false, answer: null,
      elapsedMs: 1000, reviewedAt: when, wasNew: true,
    })),
  )
}
function dueRow(itemId: string, due: Date): CardRow {
  const [r] = newCardPair('chunk', itemId, now)
  return { ...r, due, fsrs: { ...newFsrsCard(now), state: State.Review, due } }
}
async function seedDueCards(d: SinglishDB, n: number) {
  const due = new Date(now.getTime() - 3600_000)
  const ids = Array.from({ length: n }, (_, i) => 'due-' + i)
  await d.chunks.bulkAdd(ids.map((id) => chunk(id, 's1', 0)))
  await d.cards.bulkAdd(ids.map((id) => dueRow(id, due)))
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  const a = dueRow('d-late', new Date(now.getTime() - 1 * 86400000))
  const b = dueRow('d-vlate', new Date(now.getTime() - 5 * 86400000))
  late = a.id
  veryLate = b.id
  await db.cards.bulkAdd([a, b])
  await db.chunks.bulkAdd([chunk('d-late', 's1', 0), chunk('d-vlate', 's1', 0)])
  // s2 was added before s1
  await db.songs.bulkAdd([song('s1', at('2026-10-02T10:00:00')), song('s2', at('2026-10-01T10:00:00'))])
  const chunks = [
    ...Array.from({ length: 10 }, (_, i) => chunk('c1-' + i, 's1', i)),
    chunk('c2-0', 's2', 3),
    chunk('c-susp', 's1', 0, true),
  ]
  const words = [
    ...Array.from({ length: 8 }, (_, i) => word('w-' + i, 's1', i, 'learn')),
    word('w-pending', 's1', 0, 'pending'),
    word('w-known', 's1', 0, 'known'),
  ]
  await db.chunks.bulkAdd(chunks)
  await db.words.bulkAdd(words)
  const cards: CardRow[] = []
  for (const c of chunks) cards.push(...newCardPair('chunk', c.id, now))
  for (const w of words) cards.push(...newCardPair('word', w.id, now))
  // unlock every C so each item has an R+C sibling pair, both unlocked
  await db.cards.bulkAdd(cards.map((c) => ({ ...c, unlocked: 1 as const })))
})

describe('startOfLocalDay', () => {
  test('returns local midnight, also on the DST change day', () => {
    expect(startOfLocalDay(at('2026-10-25T12:00:00'))).toEqual(at('2026-10-25T00:00:00'))
    expect(startOfLocalDay(at('2026-10-31T23:59:59'))).toEqual(at('2026-10-31T00:00:00'))
  })
})

describe('estimateAvgSeconds', () => {
  test('default under 50 reviews, real average otherwise', async () => {
    expect(await estimateAvgSeconds(db)).toBe(DEFAULT_SECONDS_PER_REVIEW)
    await db.reviews.bulkAdd(
      Array.from({ length: 50 }, (_, i) => ({
        id: 'r' + i, cardId: 'x', rating: 3 as const, auto: false, answer: null,
        elapsedMs: 6000, reviewedAt: new Date(now.getTime() - i * 1000), wasNew: false,
      })),
    )
    expect(await estimateAvgSeconds(db)).toBe(6)
  })
})

describe('buildSessionQueue', () => {
  test('due first, most overdue first', async () => {
    const q = await buildSessionQueue(db, now)
    expect(q.items.slice(0, 2).map((i) => i.card.id)).toEqual([veryLate, late])
    expect(q.dueCount).toBe(2)
    expect(q.items.slice(0, 2).every((i) => !i.isNew)).toBe(true)
  })
  test('new budget is 16 minus new reviewed today (local day)', async () => {
    await seedNewReviews(db, 10, at('2026-10-31T09:00:00'))
    await seedNewReviews(db, 5, at('2026-10-30T23:50:00'))
    const q = await buildSessionQueue(db, at('2026-10-31T21:00:00'))
    expect(q.newCount).toBe(6)
  })
  test('day boundary does not double the budget', async () => {
    await seedNewReviews(db, 16, at('2026-10-31T23:50:00'))
    expect((await buildSessionQueue(db, at('2026-10-31T23:55:00'))).newCount).toBe(0)
    expect((await buildSessionQueue(db, at('2026-11-01T00:10:00'))).newCount).toBe(16)
  })
  test('heavy due load blocks new cards', async () => {
    await seedDueCards(db, 200)
    const q = await buildSessionQueue(db, now)
    expect(q.newCount).toBe(0)
    expect(q.newBlockedByLoad).toBe(true)
  })
  test('light load does not block', async () => {
    const q = await buildSessionQueue(db, now)
    expect(q.newBlockedByLoad).toBe(false)
    expect(q.newCount).toBe(16)
    expect(q.estMinutes).toBe(Math.ceil((q.items.length * 12) / 60))
  })
  test('chunks before words, no siblings, no suspended, no pending words', async () => {
    const q = await buildSessionQueue(db, now)
    const ids = q.items.map((i) => i.card.itemId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('c-susp')
    expect(ids).not.toContain('w-pending')
    expect(ids).not.toContain('w-known')
    expect(q.items.findIndex((i) => i.card.itemType === 'word')).toBeGreaterThan(
      q.items.findLastIndex((i) => i.card.itemType === 'chunk' && i.isNew),
    )
  })
  test('new order: song addedAt, then lineIndex, R before C', async () => {
    const q = await buildSessionQueue(db, now)
    const news = q.items.filter((i) => i.isNew)
    expect(news[0].card.itemId).toBe('c2-0')
    expect(news[0].card.kind).toBe('R')
    expect(news.slice(1, 4).map((i) => i.card.itemId)).toEqual(['c1-0', 'c1-1', 'c1-2'])
  })
  test('suspended item with a due card is skipped', async () => {
    const due = new Date(now.getTime() - 86400000)
    await db.cards.add(dueRow('c-susp', due))
    const q = await buildSessionQueue(db, now)
    expect(q.items.map((i) => i.card.itemId)).not.toContain('c-susp')
  })
})

describe('due selection uses the local day', () => {
  async function fresh(ids: [string, Date][]) {
    db = createDb('t-' + crypto.randomUUID())
    await db.songs.add(song('s1', at('2026-10-02T10:00:00')))
    await db.chunks.bulkAdd(ids.map(([id]) => chunk(id, 's1', 0)))
    await db.cards.bulkAdd(ids.map(([id, due]) => dueRow(id, due)))
  }
  const dueIds = async (n: Date) =>
    (await buildSessionQueue(db, n)).items.filter((i) => !i.isNew).map((i) => i.card.itemId)

  test('a card due later today (21:00) is included at 09:00', async () => {
    await fresh([['later', at('2026-10-31T21:00:00')]])
    const q = await buildSessionQueue(db, at('2026-10-31T09:00:00'))
    expect(q.dueCount).toBe(1)
    expect(await dueIds(at('2026-10-31T09:00:00'))).toEqual(['later'])
  })

  test('a card due tomorrow 00:30 is not included', async () => {
    await fresh([['tomorrow', at('2026-11-01T00:30:00')], ['today', at('2026-10-31T23:59:00')]])
    expect(await dueIds(at('2026-10-31T09:00:00'))).toEqual(['today'])
  })

  test('DST day (2026-10-25, 25h long): boundary is the next local midnight', async () => {
    await fresh([
      ['late-evening', at('2026-10-25T23:30:00')],
      ['next-day', at('2026-10-26T00:00:00')],
    ])
    expect(await dueIds(at('2026-10-25T01:00:00'))).toEqual(['late-evening'])
  })
})
