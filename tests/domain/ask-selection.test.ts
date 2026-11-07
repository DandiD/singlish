import { describe, expect, test } from 'vitest'
import { emptySelection, MAX_REQUESTS, requestsOf, tokenize, toggleJoin, toggleVerse, toggleWord, withinLimit, type Selection } from '../../src/domain/askSelection'

const lines = ['I gave up on you, babe', "don't, you know", 'paper lanterns drift']
const words = (...keys: string[]) => keys.reduce<Selection>((s, k) => toggleWord(s, k), emptySelection())

describe('selezione nel testo', () => {
  test('le parole di un verso, con apostrofi', () => {
    expect(tokenize("don't, you").map((t) => t.text)).toEqual(["don't", 'you'])
  })

  test('parole segnate senza giunto sono voci separate; il giunto le unisce e si toglie', () => {
    const s = words('0:1', '0:2')
    expect(requestsOf(lines, s)).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave' }, { id: 'w2', lineIndex: 0, text: 'up' }])
    const joined = toggleJoin(s, '0:1')
    expect(requestsOf(lines, joined)).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave up' }])
    expect(requestsOf(lines, toggleJoin(joined, '0:1'))).toHaveLength(2)
  })

  test('togliere la parola di mezzo di una catena la spezza e toglie i giunti', () => {
    let s = words('0:1', '0:2', '0:3')
    s = toggleJoin(toggleJoin(s, '0:1'), '0:2')
    expect(requestsOf(lines, s)).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave up on' }])
    s = toggleWord(s, '0:2')
    expect(requestsOf(lines, s).map((r) => r.text)).toEqual(['gave', 'on'])
    expect(s.joins.size).toBe(0)
  })

  test('un giunto senza la parola vicina segnata non fa nulla (stesso oggetto)', () => {
    const s = words('0:3')
    expect(toggleJoin(s, '0:3')).toBe(s)
  })

  test('il giunto passa sopra la punteggiatura', () => {
    const s = toggleJoin(words('1:0', '1:1'), '1:0')
    expect(requestsOf(lines, s)).toEqual([{ id: 'w1', lineIndex: 1, text: "don't, you" }])
  })

  test('un verso intero è una voce senza testo, dopo le parole; due toggle lo tolgono', () => {
    const s = toggleVerse(words('0:1'), 2)
    expect(requestsOf(lines, s)).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave' }, { id: 'v1', lineIndex: 2 }])
    expect(requestsOf(lines, toggleVerse(s, 2))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave' }])
  })

  test('le voci seguono l’ordine del testo', () => {
    expect(requestsOf(lines, words('2:0', '0:1')).map((r) => [r.id, r.lineIndex])).toEqual([['w1', 0], ['w2', 2]])
  })

  test('il toggle non modifica la selezione di partenza', () => {
    const s = emptySelection()
    toggleWord(s, '0:1')
    expect(s.words.size).toBe(0)
  })
})

describe('limite di richieste', () => {
  const long = [Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')]
  const separate = (n: number) => words(...Array.from({ length: n }, (_, i) => `0:${i * 2}`))

  test('la tredicesima voce non entra; togliere da dodici sì', () => {
    expect(MAX_REQUESTS).toBe(12)
    const twelve = separate(12)
    expect(withinLimit(long, twelve, toggleWord(twelve, '0:30'))).toBe(false)
    expect(withinLimit(long, twelve, toggleWord(twelve, '0:0'))).toBe(true)
  })

  test('spezzare una catena può superare il limite', () => {
    let s = words('0:0', '0:1', '0:2', ...Array.from({ length: 11 }, (_, i) => `0:${i * 2 + 6}`))
    s = toggleJoin(toggleJoin(s, '0:0'), '0:1')
    expect(requestsOf(long, s)).toHaveLength(12)
    expect(withinLimit(long, s, toggleWord(s, '0:1'))).toBe(false)
  })
})
