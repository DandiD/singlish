import { describe, expect, test } from 'vitest'
import { safeCoverUrl } from '../../src/domain/spotify'
import { COVER_URL_PATTERN, coverRuntimeCaching } from '../../src/pwa/covers'

const samples: Array<[string, boolean]> = [
  ['https://i.scdn.co/image/ab67', true],
  ['https://image-cdn-ak.spotifycdn.com/image/x', true],
  ['https://mosaic.scdn.co/640/x', true],
  ['https://i.scdn.co.evil.example/x', false],
  ['http://i.scdn.co/x', false],
  ['https://open.spotify.com/oembed', false],
  ['https://a.b.spotifycdn.com/x', false],
  ['https://spotifycdn.com/x', false],
  ['https://i.scdn.co:8443/x', false],
  ['https://user:pw@i.scdn.co/x', false],
  ['https://xi.scdn.co/x', false],
]

describe('cover URL pattern and safeCoverUrl agree', () => {
  test.each(samples)('%s -> %s', (url, expected) => {
    expect(COVER_URL_PATTERN.test(url)).toBe(expected)
    expect(safeCoverUrl(url) !== null).toBe(expected)
  })
})

describe('cover runtime caching entry', () => {
  test('is cache-first with the agreed limits', () => {
    expect(coverRuntimeCaching.urlPattern).toBe(COVER_URL_PATTERN)
    expect(coverRuntimeCaching.handler).toBe('CacheFirst')
    expect(coverRuntimeCaching.options).toEqual({
      cacheName: 'covers',
      expiration: { maxEntries: 60, maxAgeSeconds: 7776000 },
      cacheableResponse: { statuses: [0, 200] },
    })
  })
})
