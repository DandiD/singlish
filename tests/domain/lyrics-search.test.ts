import { describe, expect, test } from 'vitest'
import { lyricsSearchUrl } from '../../src/domain/lyricsSearch'

describe('lyricsSearchUrl', () => {
  test('Google search for title, artist and «lyrics»', () => {
    expect(lyricsSearchUrl('Midnight Harbor', 'The Paper Owls'))
      .toBe('https://www.google.com/search?q=Midnight+Harbor+The+Paper+Owls+lyrics')
  })
  test('title only, trimmed, special characters encoded', () => {
    expect(lyricsSearchUrl('  Rock & Roll?  ', ' ')).toBe('https://www.google.com/search?q=Rock+%26+Roll%3F+lyrics')
  })
  test('null without title nor artist', () => {
    expect(lyricsSearchUrl('', '  ')).toBeNull()
  })
})
