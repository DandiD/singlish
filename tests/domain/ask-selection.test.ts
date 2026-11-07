import { describe, expect, test } from 'vitest'
import { emptySelection, MAX_REQUESTS, requestsOf, selectRange, tokenize, toggleVerse, toggleWord, withinLimit, type Selection } from '../../src/domain/askSelection'

const lines = ['I gave up on you, babe', "don't, you know", 'paper lanterns drift']
const words = (...keys: string[]) => keys.reduce<Selection>((s, k) => toggleWord(s, k), emptySelection())

describe('selezione nel testo', () => {
  test('le parole di un verso, con apostrofi', () => {
    expect(tokenize("don't, you").map((t) => t.text)).toEqual(["don't", 'you'])
  })

  test('parole segnate con due tocchi sono voci separate', () => {
    expect(requestsOf(lines, words('0:1', '0:2'))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave' }, { id: 'w2', lineIndex: 0, text: 'up' }])
  })

  test("trascinare segna un'espressione; tornando indietro si accorcia", () => {
    const base = emptySelection()
    expect(requestsOf(lines, selectRange(base, 0, 1, 3))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave up on' }])
    expect(requestsOf(lines, selectRange(base, 0, 1, 2))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave up' }])
    expect(requestsOf(lines, selectRange(base, 0, 1, 1))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave' }])
    // anche all'indietro, da destra a sinistra
    expect(requestsOf(lines, selectRange(base, 0, 3, 1))).toEqual([{ id: 'w1', lineIndex: 0, text: 'gave up on' }])
  })

  test("l'intervallo assorbe le parole già segnate e resta separato dalle vicine", () => {
    const s = selectRange(words('0:0', '0:2', '0:4'), 0, 2, 3)
    expect(requestsOf(lines, s).map((r) => r.text)).toEqual(['I', 'up on', 'you'])
  })

  test("un intervallo dentro un'espressione la spezza ai bordi", () => {
    const s = selectRange(selectRange(emptySelection(), 0, 0, 3), 0, 3, 4)
    expect(requestsOf(lines, s).map((r) => r.text)).toEqual(['I gave up', 'on you'])
  })

  test("togliere la parola di mezzo di un'espressione la spezza", () => {
    const s = toggleWord(selectRange(emptySelection(), 0, 1, 3), '0:2')
    expect(requestsOf(lines, s).map((r) => r.text)).toEqual(['gave', 'on'])
    expect(s.joins.size).toBe(0)
  })

  test("l'intervallo passa sopra la punteggiatura", () => {
    expect(requestsOf(lines, selectRange(emptySelection(), 1, 0, 1))).toEqual([{ id: 'w1', lineIndex: 1, text: "don't, you" }])
  })

  test("l'intervallo non modifica la selezione di partenza", () => {
    const base = words('0:0')
    selectRange(base, 0, 0, 3)
    expect([...base.words]).toEqual(['0:0'])
    expect(base.joins.size).toBe(0)
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
    const s = selectRange(words(...Array.from({ length: 11 }, (_, i) => `0:${i * 2 + 6}`)), 0, 0, 2)
    expect(requestsOf(long, s)).toHaveLength(12)
    expect(withinLimit(long, s, toggleWord(s, '0:1'))).toBe(false)
  })

  test('un intervallo che assorbe voci non aumenta il conto', () => {
    const twelve = separate(12)
    expect(withinLimit(long, twelve, selectRange(twelve, 0, 0, 2))).toBe(true)
  })
})
