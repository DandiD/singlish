import { describe, expect, it } from 'vitest'
import { segmentOf, sessionSegments, streakGlowAt, segmentsLabel, type Outcome } from '../../src/domain/sessionRhythm'

const r = (rating: 1 | 2 | 3 | 4): Outcome => ({ kind: 'rated', rating })
const w: Outcome = { kind: 'written' }

describe('segmentOf', () => {
  it('maps ratings to fill', () => {
    expect([1, 2, 3, 4].map((x) => segmentOf(x as 1 | 2 | 3 | 4))).toEqual(['empty', 'half', 'full', 'full'])
  })
})

describe('sessionSegments', () => {
  it('places done, outcomes and todo', () => {
    expect(sessionSegments({ doneBefore: 2, outcomes: [r(3), r(2), w, r(1)], total: 8 })).toEqual([
      'done', 'done', 'full', 'half', 'written', 'empty', 'todo', 'todo',
    ])
  })
  it('never exceeds total', () => {
    expect(sessionSegments({ doneBefore: 0, outcomes: [r(3), r(3)], total: 2 })).toEqual(['full', 'full'])
  })
})

describe('streakGlowAt', () => {
  it('glows on the 5th and only once', () => {
    expect(streakGlowAt([r(3), r(3), r(3), r(3), r(3)])).toEqual([4])
    expect(streakGlowAt(Array(10).fill(r(3)))).toEqual([4])
  })
  it('restarts after Again', () => {
    expect(streakGlowAt([r(3), r(3), r(3), r(3), r(1), r(3), r(3), r(3), r(3), r(3)])).toEqual([9])
  })
  it('Hard counts, written neither counts nor breaks', () => {
    expect(streakGlowAt([r(3), r(2), w, r(4), r(3), r(3)])).toEqual([5])
    expect(streakGlowAt([r(3), r(3), r(1), w, r(3), r(3), r(3)])).toEqual([])
  })
  it('a new streak can glow again', () => {
    const run = Array(5).fill(r(3))
    expect(streakGlowAt([...run, r(1), ...run])).toEqual([4, 10])
  })
})

describe('segmentsLabel', () => {
  it('omits zero parts', () => {
    expect(segmentsLabel([r(3), r(4), r(1)])).toBe('Voti finora: 2 Bene o Facile, 1 Di nuovo')
    expect(segmentsLabel([r(2), w])).toBe('Voti finora: 1 Difficile')
  })
  it('says no votes when empty', () => {
    expect(segmentsLabel([])).toBe('Nessun voto finora')
    expect(segmentsLabel([w])).toBe('Nessun voto finora')
  })
})
