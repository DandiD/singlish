import { describe, expect, it } from 'vitest'
import { activityLevel, dailyActivity } from '../../src/domain/progress'

const at = (y: number, m: number, d: number, h = 12, min = 0) => ({ reviewedAt: new Date(y, m - 1, d, h, min) })

describe('activityLevel', () => {
  it.each([[0, 0], [1, 1], [9, 1], [10, 2], [24, 2], [25, 3], [49, 3], [50, 4], [200, 4]])('%i reviews -> level %i', (n, lvl) => {
    expect(activityLevel(n)).toBe(lvl)
  })
})

describe('dailyActivity', () => {
  const now = new Date(2026, 10, 5, 15, 0) // Thursday 2026-11-05

  it('returns 12 weeks of 7 days, first column 11 weeks before this Monday', () => {
    const w = dailyActivity([], [], now)
    expect(w).toHaveLength(12)
    w.forEach((c) => expect(c).toHaveLength(7))
    expect(w[0][0].key).toBe('2026-08-17')
    expect(w[11][0].key).toBe('2026-11-02')
    expect(w[11][6].key).toBe('2026-11-08')
  })

  it('counts reviews per local day (23:59 vs 00:01)', () => {
    const revs = [at(2026, 11, 3, 23, 59), at(2026, 11, 4, 0, 1), at(2026, 11, 4, 9), at(2026, 11, 4, 10)]
    const last = dailyActivity(revs, [], now)[11]
    expect(last[1]).toMatchObject({ key: '2026-11-03', reviews: 1, level: 1 })
    expect(last[2]).toMatchObject({ key: '2026-11-04', reviews: 3, level: 1 })
  })

  it('ignores reviews older than 12 weeks', () => {
    const w = dailyActivity([at(2026, 8, 16), at(2026, 8, 17)], [], now)
    expect(w[0][0].reviews).toBe(1)
    expect(w.flat().reduce((s, d) => s + d.reviews, 0)).toBe(1)
  })

  it('marks free days and future days', () => {
    const w = dailyActivity([], ['2026-11-02'], now)
    expect(w[11][0]).toMatchObject({ free: true, level: 0, future: false })
    expect(w[11][3]).toMatchObject({ key: '2026-11-05', future: false, free: false })
    expect(w[11][4]).toMatchObject({ future: true, reviews: 0 })
    expect(w[11][6].future).toBe(true)
  })

  it('keeps 7 days per column across DST changes', () => {
    const w = dailyActivity([], [], new Date(2026, 9, 28)) // after Oct 25 DST end
    expect(w[11][0].key).toBe('2026-10-26')
    expect(w[10][6].key).toBe('2026-10-25')
    expect(w[10][0].key).toBe('2026-10-19')
  })
})
