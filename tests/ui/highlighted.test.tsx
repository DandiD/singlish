import { describe, expect, test } from 'vitest'
import { highlightLine } from '../../src/ui/components/Highlighted'

describe('highlightLine', () => {
  test('highlights case-insensitively and survives misses', () => {
    const out = highlightLine('Every night I Let It Slide', [
      { text: 'let it slide', id: 'c1', className: 'id' },
      { text: 'missing', id: 'c2', className: 'ph' },
    ])
    expect(out).toEqual([{ text: 'Every night I ' }, { text: 'Let It Slide', id: 'c1', className: 'id' }])
  })

  test('typographic apostrophe in the line matches a straight one in the span', () => {
    const out = highlightLine('But I’m over it now', [{ text: "i'm over it", id: 'c1', className: 'co' }])
    expect(out).toEqual([{ text: 'But ' }, { text: 'I’m over it', id: 'c1', className: 'co' }, { text: ' now' }])
  })

  test('overlapping spans: the longest wins', () => {
    const out = highlightLine('So call it off now', [
      { text: 'call it', id: 'a', className: 'ph' },
      { text: 'call it off', id: 'b', className: 'ph' },
    ])
    expect(out).toEqual([{ text: 'So ' }, { text: 'call it off', id: 'b', className: 'ph' }, { text: ' now' }])
  })

  test('line without matches stays intact', () => {
    expect(highlightLine('Nothing here', [{ text: 'zzz', id: 'x', className: 'w' }])).toEqual([{ text: 'Nothing here' }])
  })
})
