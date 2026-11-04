import { describe, expect, test } from 'vitest'
import { buildVocabTest, scoreVocabTest, vocabTestAvailable, PSEUDOWORDS, BANDS } from '../../src/domain/vocabTest'

const freq = Array.from({ length: 20000 }, (_, i) => `word${i + 1}`)
const seq = (() => { let x = 0.123; return () => { x = (x * 9301 + 49297) % 233280 / 233280; return x } })

describe('test di vocabolario', () => {
  test('60 parole vere, 10 per fascia, e 20 inventate, mescolate', () => {
    const items = buildVocabTest(freq, seq())
    expect(items).toHaveLength(80)
    expect(items.filter((i) => i.fake)).toHaveLength(20)
    for (const b of BANDS) expect(items.filter((i) => !i.fake && i.rank! >= b.from && i.rank! <= b.to)).toHaveLength(10)
    expect(new Set(items.map((i) => i.word)).size).toBe(80)
    expect(items.filter((i) => i.fake).every((i) => PSEUDOWORDS.includes(i.word))).toBe(true)
  })
  test('stima: chi conosce le prime 4000 e non dice sì alle inventate', () => {
    const items = buildVocabTest(freq, seq())
    const answers = items.map((i) => !i.fake && i.rank! <= 4000)
    const r = scoreVocabTest(items, answers)
    expect(r.falseAlarms).toBe(0)
    expect(r.estimate).toBe(4000)
  })
  test('chi dice sì a tutto non sa nulla: le inventate annullano i sì', () => {
    const items = buildVocabTest(freq, seq())
    const r = scoreVocabTest(items, items.map(() => true))
    expect(r.falseAlarms).toBe(20)
    expect(r.estimate).toBe(0)
  })
  test('i sì alle inventate correggono la stima verso il basso', () => {
    const items = buildVocabTest(freq, seq())
    const seen = new Map<number, number>()
    // conosce 8 parole su 10 nelle fasce fino a 4000
    const real = items.map((i) => {
      if (i.fake || i.rank! > 4000) return false
      const band = i.rank! <= 1000 ? 0 : i.rank! <= 2000 ? 1 : 2
      seen.set(band, (seen.get(band) ?? 0) + 1)
      return seen.get(band)! <= 8
    })
    let fakes = 0
    const withFakes = items.map((i, k) => (i.fake ? fakes++ < 4 : real[k]))
    const honest = scoreVocabTest(items, real)
    const guessy = scoreVocabTest(items, withFakes)
    expect(honest.estimate).toBe(3200)
    expect(guessy.falseAlarms).toBe(4)
    expect(guessy.estimate).toBe(3000)
  })
})

describe('lista di frequenza incompleta', () => {
  test('usa solo le fasce coperte per intero', () => {
    const short = Array.from({ length: 6000 }, (_, i) => `w${i + 1}`)
    const items = buildVocabTest(short, seq())
    expect(items.filter((i) => !i.fake)).toHaveLength(30)
    expect(Math.max(...items.filter((i) => !i.fake).map((i) => i.rank!))).toBeLessThanOrEqual(4000)
  })
  test('con meno di tre fasce coperte il test non si può fare', () => {
    expect(vocabTestAvailable(Array.from({ length: 30 }, (_, i) => `w${i}`))).toBe(false)
    expect(vocabTestAvailable(Array.from({ length: 4000 }, (_, i) => `w${i}`))).toBe(true)
  })
})
