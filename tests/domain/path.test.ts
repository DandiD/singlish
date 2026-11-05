import { describe, expect, it } from 'vitest'
import type { Song } from '../../src/db/types'
import { songPath } from '../../src/domain/path'

const DAY = 86_400_000
const HOUR = 3_600_000
const now = new Date('2026-03-20T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

const mk = (o: Partial<Song> = {}): Song => ({
  id: 's1', kind: 'song', title: 'Inventata', artist: 'Nessuno', spotifyUrl: null, lines: ['a', 'b'],
  status: 'studying', level: 'B1', difficultyKnownPct: null, comprehensionBefore: null, grammarPoint: null,
  connectedSpeech: [], addedAt: ago(10 * DAY), analyzedAt: ago(9 * DAY), ...o,
})
const path = (song: Song, o: { toTriage?: number; unlocked?: number; lines?: number; finalReady?: boolean } = {}) =>
  songPath({ song, toTriage: 0, unlocked: 0, lines: 0, finalReady: false, now, ...o })
const stage = (s: ReturnType<typeof path>, id: string) => s.find((x) => x.id === id)!

describe('songPath', () => {
  it('names and order for a song', () => {
    expect(path(mk()).map((s) => s.name)).toEqual(['Ascolto', 'Analisi', 'Studio', 'Smista', 'Ripasso', 'Riascolto'])
  })

  it('free text has 5 stages, Lettura, no Riascolto', () => {
    const p = path(mk({ kind: 'text', source: 'serie' }))
    expect(p.map((s) => s.name)).toEqual(['Lettura', 'Analisi', 'Studio', 'Smista', 'Ripasso'])
    expect(p.some((s) => s.id === 'final')).toBe(false)
  })

  it('listen: done with percentage, todo without', () => {
    expect(stage(path(mk({ comprehensionBefore: 40 })), 'listen')).toMatchObject({ state: 'done', detail: '40%', action: null })
    expect(stage(path(mk()), 'listen')).toMatchObject({ state: 'todo', detail: null })
  })

  it('analyze: queued song is current with analyzing action; draft too; analyzed is done', () => {
    expect(stage(path(mk({ status: 'queued' })), 'analyze')).toMatchObject({ state: 'current', action: 'analyzing' })
    expect(stage(path(mk({ status: 'draft' })), 'analyze')).toMatchObject({ state: 'current', action: 'analyzing' })
    expect(stage(path(mk({ status: 'analyzed' })), 'analyze')).toMatchObject({ state: 'done', action: null })
  })

  it('study: current when analyzed, done when studying/done, todo before analysis', () => {
    expect(stage(path(mk({ status: 'analyzed' })), 'study').state).toBe('current')
    expect(stage(path(mk({ status: 'studying' })), 'study').state).toBe('done')
    expect(stage(path(mk({ status: 'done' })), 'study').state).toBe('done')
    expect(stage(path(mk({ status: 'queued' })), 'study').state).toBe('todo')
  })

  it('triage: done with nothing to sort, partial with N da fare and action', () => {
    expect(stage(path(mk()), 'triage')).toMatchObject({ state: 'done', action: null })
    expect(stage(path(mk(), { toTriage: 3 }), 'triage')).toMatchObject({ state: 'partial', detail: '3 da fare', action: 'triage' })
  })

  it('review: done, partial, todo with counts, todo without lines', () => {
    expect(stage(path(mk(), { lines: 4, unlocked: 4 }), 'review')).toMatchObject({ state: 'done', action: null })
    expect(stage(path(mk(), { lines: 4, unlocked: 2 }), 'review')).toMatchObject({ state: 'partial', detail: '2 di 4' })
    expect(stage(path(mk(), { lines: 4, unlocked: 0 }), 'review')).toMatchObject({ state: 'todo', detail: '0 di 4' })
    expect(stage(path(mk(), { lines: 0 }), 'review')).toMatchObject({ state: 'todo', detail: null })
  })

  it('final: done with +N, or N% without before', () => {
    expect(stage(path(mk({ status: 'done', comprehensionBefore: 40, comprehensionAfter: 68 })), 'final')).toMatchObject({ state: 'done', detail: '+28' })
    expect(stage(path(mk({ status: 'done', comprehensionAfter: 70 })), 'final')).toMatchObject({ state: 'done', detail: '70%' })
  })

  it('final: negative or zero gain has no plus sign', () => {
    expect(stage(path(mk({ status: 'done', comprehensionBefore: 70, comprehensionAfter: 65 })), 'final').detail).toBe('-5')
    expect(stage(path(mk({ status: 'done', comprehensionBefore: 50, comprehensionAfter: 50 })), 'final').detail).toBe('0')
  })

  it('final: ready is current with pronto and action', () => {
    expect(stage(path(mk(), { finalReady: true }), 'final')).toMatchObject({ state: 'current', detail: 'pronto', action: 'finalListen' })
  })

  it('final: studying not yet ready counts days, rounded up, min 1', () => {
    const a = mk({ studyStartedAt: ago(2 * DAY + HOUR) })
    expect(stage(path(a), 'final')).toMatchObject({ state: 'todo', detail: 'tra 5 giorni', action: null })
    const b = mk({ studyStartedAt: ago(6 * DAY + 23 * HOUR) })
    expect(stage(path(b), 'final').detail).toBe('tra 1 giorno')
  })

  it('final: falls back to analyzedAt then addedAt for the start', () => {
    const a = mk({ studyStartedAt: null, analyzedAt: ago(3 * DAY) })
    expect(stage(path(a), 'final').detail).toBe('tra 4 giorni')
    const b = mk({ studyStartedAt: null, analyzedAt: null, addedAt: ago(5 * DAY) })
    expect(stage(path(b), 'final').detail).toBe('tra 2 giorni')
  })

  it('final: not studying has no detail', () => {
    expect(stage(path(mk({ status: 'analyzed' })), 'final')).toMatchObject({ state: 'todo', detail: null, action: null })
  })

  it('ready final listen with words to sort: both stages visible, actions only where available', () => {
    const p = path(mk(), { finalReady: true, toTriage: 2, lines: 4, unlocked: 1 })
    expect(stage(p, 'triage')).toMatchObject({ state: 'partial', action: 'triage' })
    expect(stage(p, 'final')).toMatchObject({ state: 'current', action: 'finalListen' })
    expect(p.filter((s) => s.action).map((s) => s.id)).toEqual(['triage', 'final'])
  })

  it('no action when stage is not available', () => {
    const p = path(mk({ status: 'analyzed' }))
    expect(p.every((s) => s.action === null)).toBe(true)
  })
})
