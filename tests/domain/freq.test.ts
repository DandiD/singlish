import { describe, expect, test, vi } from 'vitest'
import { filterWordsByBand, loadRanks, ranksFromList, resetRanksCache } from '../../src/domain/freq'

const ranks = ranksFromList(['the', 'be', 'Harbour', 'dawn', 'the'])

describe('freq', () => {
  test('ranks are 1-based, lowercase, first wins', () => {
    expect(ranks.get('the')).toBe(1)
    expect(ranks.get('harbour')).toBe(3)
  })

  test('filter keeps in-band, unknown, ranked words', () => {
    const words = [{ lemma: 'dawn' }, { lemma: 'the' }, { lemma: 'harbour' }, { lemma: 'zzz' }]
    const out = filterWordsByBand(words, ranks, [3, 4], new Set(['harbour']))
    expect(out).toEqual([{ lemma: 'dawn', freqRank: 4 }])
  })

  test('band is inclusive and matching is case-insensitive', () => {
    const out = filterWordsByBand([{ lemma: 'Harbour' }, { lemma: 'DAWN' }], ranks, [3, 4], new Set(['x']))
    expect(out.map((w) => w.freqRank)).toEqual([3, 4])
    expect(filterWordsByBand([{ lemma: 'Dawn' }], ranks, [3, 4], new Set(['dawn']))).toEqual([])
  })

  test('loadRanks caches success, retries after failure', async () => {
    resetRanksCache()
    const ok = { ok: true, json: async () => ['a', 'b'] } as Response
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValue(ok)
    await expect(loadRanks(fetchFn)).rejects.toThrow()
    const m = await loadRanks(fetchFn)
    expect(m.get('b')).toBe(2)
    await loadRanks(fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
