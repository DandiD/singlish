import { describe, expect, test } from 'vitest'
import { gradeAnswer, levenshtein, normalizeAnswer, normalizeKey, splitLines } from '../../src/domain/text'

describe('text', () => {
  test('splitLines cleans pasted lyrics', () => {
    const raw = '[Verse 1]\r\nI ran   down the road\r\n\r\n\r\n  We’re late again \n[Chorus]\nLa la'
    expect(splitLines(raw)).toEqual(['I ran down the road', "We're late again", 'La la'])
  })
  test('splitLines handles lone CR, whitespace-only lines, inline brackets', () => {
    expect(splitLines('a b\rc d\r   \r\t\r[Chorus] la la')).toEqual(['a b', 'c d', '[Chorus] la la'])
    expect(splitLines('  [Bridge]  \nok')).toEqual(['ok'])
  })
  test('normalizeAnswer expands contractions and quotes', () => {
    expect(normalizeAnswer('  I’m GONNA  go ')).toBe('i am going to go')
    expect(normalizeAnswer("can't")).toBe('cannot')
  })
  test('contractions replace whole words only', () => {
    expect(normalizeAnswer("it's bits")).toBe('it is bits')
    expect(normalizeAnswer('Don‘t you’re WON’T wanna')).toBe('do not you are will not want to')
    expect(normalizeAnswer('gonnabe')).toBe('gonnabe')
  })
  test('levenshtein', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })
  test('gradeAnswer', () => {
    expect(gradeAnswer('let it slide', 'let it slide')).toEqual({ rating: 3, distance: 0 })
    expect(gradeAnswer('let it slid', 'let it slide').rating).toBe(2)
    expect(gradeAnswer('let go', 'let it slide').rating).toBe(1)
    expect(gradeAnswer("I'm over it", 'I am over it').rating).toBe(3)
  })
  test('gradeAnswer measures distance on normalized strings', () => {
    expect(gradeAnswer('  IT’S  fine ', 'it is fine')).toEqual({ rating: 3, distance: 0 })
    expect(gradeAnswer("it's fin", 'it is fine')).toEqual({ rating: 2, distance: 1 })
  })
  test('normalizeKey ignores case and quotes', () => {
    expect(normalizeKey('Get It Off My Chest')).toBe(normalizeKey('get it off my chest'))
    expect(normalizeKey('Don’t stop')).toBe(normalizeKey("don't  STOP"))
  })
  test('una contrazione scritta senza apostrofo è un errore di battitura, non una risposta sbagliata', () => {
    expect(gradeAnswer("dont let go", "don't let go")).toEqual({ rating: 2, distance: 1 })
    expect(gradeAnswer('im over it', "I'm over it").rating).toBe(2)
  })
})
