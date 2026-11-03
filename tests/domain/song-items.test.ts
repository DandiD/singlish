import { describe, expect, test } from 'vitest'
import { findForm, formIn, highlightLine } from '../../src/domain/songItems'

describe('forma di una voce in un verso (dati salvati senza la forma del verso)', () => {
  test('verbo irregolare in un chunk: «run out of» trova «ran out of»', () => {
    expect(formIn('we ran out of words', [undefined, 'running out of', 'run out of'])).toBe('ran out of')
  })
  test('participio irregolare: «give up» trova «given up»', () => {
    expect(formIn("I've given up on you", [undefined, 'give up', 'give up'])).toBe('given up')
  })
  test('parola singola irregolare: «go» trova «went», «child» trova «children»', () => {
    expect(formIn('and then she went away', [undefined, 'goes', 'go'])).toBe('went')
    expect(formIn('the children sing', [undefined, 'child', 'child'])).toBe('children')
  })
  test('nessuna corrispondenza inventata: una parola diversa non viene presa', () => {
    expect(formIn('we rang the bell', [undefined, 'running out of', 'run out of'])).toBe('running out of')
    expect(formIn('the gone days', [undefined, 'goes', 'go'])).toBe('gone')
  })
  test('la forma salvata vince sulle varianti', () => {
    expect(formIn('we ran out of words', ['ran out of', 'running out of', 'run out of'])).toBe('ran out of')
  })
})

describe('posizione della forma nel verso: parola intera prima di un pezzo di parola', () => {
  test('«end» in «My friends never end» è la parola finale, non il pezzo di «friends»', () => {
    const line = 'My friends never end'
    expect(findForm(line, 'end')).toEqual({ start: 17, end: 20 })
    const segs = highlightLine(line, [{ text: 'end', id: 'w', className: 'w' }])
    expect(segs.find((s) => 'id' in s)).toMatchObject({ text: 'end' })
    expect(segs[0]).toEqual({ text: 'My friends never ' })
  })
  test('se non c\'è come parola intera, vale il pezzo di parola («wander» in «wandered»)', () => {
    expect(findForm('we wandered home', 'wander')).toEqual({ start: 3, end: 9 })
  })
  test('apostrofi tipografici e maiuscole non contano', () => {
    expect(findForm('Don’t Let Go', "don't let go")).toEqual({ start: 0, end: 12 })
  })
})
