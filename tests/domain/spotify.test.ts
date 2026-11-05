import { describe, expect, test, vi } from 'vitest'
import { fetchTrackInfo, fetchTrackTitle, parseSpotifyTrackUrl, safeCoverUrl } from '../../src/domain/spotify'

describe('parseSpotifyTrackUrl', () => {
  test('parses track links', () => {
    expect(parseSpotifyTrackUrl('https://open.spotify.com/intl-it/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'))
      .toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
    expect(parseSpotifyTrackUrl('https://open.spotify.com/album/123')).toBeNull()
    expect(parseSpotifyTrackUrl('not a url')).toBeNull()
  })
  test('intl prefix without si, and trimmed input', () => {
    expect(parseSpotifyTrackUrl('  https://open.spotify.com/intl-it/track/abc123  '))
      .toBe('https://open.spotify.com/track/abc123')
    expect(parseSpotifyTrackUrl('https://open.spotify.com/track/abc123'))
      .toBe('https://open.spotify.com/track/abc123')
  })
  test('rejects other hosts and http', () => {
    expect(parseSpotifyTrackUrl('https://example.com/track/abc123')).toBeNull()
    expect(parseSpotifyTrackUrl('http://open.spotify.com/track/abc123')).toBeNull()
  })
})

describe('fetchTrackTitle', () => {
  test('title from oEmbed, null on failure', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'Late Train Home' })))
    expect(await fetchTrackTitle('https://open.spotify.com/track/x', ok)).toBe('Late Train Home')
    expect(ok).toHaveBeenCalledWith('https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fx')
    const ko = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchTrackTitle('https://open.spotify.com/track/x', ko)).toBeNull()
  })
  test('non-ok status, missing or empty title, bad JSON -> null', async () => {
    const u = 'https://open.spotify.com/track/x'
    expect(await fetchTrackTitle(u, vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))).toBeNull()
    expect(await fetchTrackTitle(u, vi.fn().mockResolvedValue(new Response('{}')))).toBeNull()
    expect(await fetchTrackTitle(u, vi.fn().mockResolvedValue(new Response('{"title":"  "}')))).toBeNull()
    expect(await fetchTrackTitle(u, vi.fn().mockResolvedValue(new Response('nope')))).toBeNull()
  })
})

describe('fetchTrackInfo', () => {
  const track = 'https://open.spotify.com/track/x'
  const oembed = 'https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fx'
  const reply = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))

  test('reads title and cover from oEmbed', async () => {
    const f = reply({ title: 'Late Train Home', thumbnail_url: 'https://i.scdn.co/image/ab67' })
    expect(await fetchTrackInfo(track, f)).toEqual({
      title: 'Late Train Home',
      thumbnailUrl: 'https://i.scdn.co/image/ab67',
    })
    expect(f).toHaveBeenCalledWith(oembed)
  })

  test('accepts a spotifycdn.com cover', async () => {
    const f = reply({ title: 'T', thumbnail_url: 'https://image-cdn-ak.spotifycdn.com/image/x' })
    expect((await fetchTrackInfo(track, f))?.thumbnailUrl).toBe('https://image-cdn-ak.spotifycdn.com/image/x')
  })

  test('http cover is ignored, title still read', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T', thumbnail_url: 'http://i.scdn.co/x' })))
      .toEqual({ title: 'T', thumbnailUrl: null })
  })
  test('foreign host cover is ignored, title still read', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T', thumbnail_url: 'https://evil.example/x.jpg' })))
      .toEqual({ title: 'T', thumbnailUrl: null })
  })
  test('lookalike host cover is ignored, title still read', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T', thumbnail_url: 'https://i.scdn.co.evil.example/x' })))
      .toEqual({ title: 'T', thumbnailUrl: null })
  })
  test('empty cover is ignored, title still read', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T', thumbnail_url: '' })))
      .toEqual({ title: 'T', thumbnailUrl: null })
  })
  test('non-string cover is ignored, title still read', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T', thumbnail_url: 42 })))
      .toEqual({ title: 'T', thumbnailUrl: null })
  })
  test('missing cover and missing title give null fields', async () => {
    expect(await fetchTrackInfo(track, reply({ title: 'T' }))).toEqual({ title: 'T', thumbnailUrl: null })
    expect(await fetchTrackInfo(track, reply({ thumbnail_url: 'https://i.scdn.co/a' })))
      .toEqual({ title: null, thumbnailUrl: 'https://i.scdn.co/a' })
  })

  test('network failure -> null', async () => {
    expect(await fetchTrackInfo(track, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))).toBeNull()
  })
  test('404 -> null', async () => {
    expect(await fetchTrackInfo(track, vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))).toBeNull()
  })
  test('body that is not JSON -> null', async () => {
    expect(await fetchTrackInfo(track, vi.fn().mockResolvedValue(new Response('nope')))).toBeNull()
  })
})

describe('safeCoverUrl', () => {
  test('accepts i.scdn.co and mosaic.scdn.co over https', () => {
    expect(safeCoverUrl('https://i.scdn.co/image/ab67')).toBe('https://i.scdn.co/image/ab67')
    expect(safeCoverUrl('https://mosaic.scdn.co/640/abc')).toBe('https://mosaic.scdn.co/640/abc')
  })
  test('accepts exactly one label before spotifycdn.com', () => {
    expect(safeCoverUrl('https://image-cdn-ak.spotifycdn.com/image/x'))
      .toBe('https://image-cdn-ak.spotifycdn.com/image/x')
  })
  test('uppercase host is normalised and accepted', () => {
    expect(safeCoverUrl('https://I.SCDN.CO/x')).toBe('https://i.scdn.co/x')
  })
  test('explicit port on an accepted host is allowed', () => {
    expect(safeCoverUrl('https://i.scdn.co:8443/x')).toBe('https://i.scdn.co:8443/x')
  })
  test('rejects http', () => {
    expect(safeCoverUrl('http://i.scdn.co/x')).toBeNull()
  })
  test('rejects other hosts', () => {
    expect(safeCoverUrl('https://evil.example/x.jpg')).toBeNull()
  })
  test('rejects lookalike hosts', () => {
    expect(safeCoverUrl('https://i.scdn.co.evil.example/x')).toBeNull()
    expect(safeCoverUrl('https://evil.example/i.scdn.co')).toBeNull()
    expect(safeCoverUrl('https://xi.scdn.co/x')).toBeNull()
  })
  test('rejects nested subdomains of spotifycdn.com', () => {
    expect(safeCoverUrl('https://a.b.spotifycdn.com/x')).toBeNull()
  })
  test('rejects the bare spotifycdn.com apex', () => {
    expect(safeCoverUrl('https://spotifycdn.com/x')).toBeNull()
  })
  test('rejects javascript: and data: URLs', () => {
    expect(safeCoverUrl('javascript:alert(1)')).toBeNull()
    expect(safeCoverUrl('data:image/png;base64,AAAA')).toBeNull()
  })
  test('rejects empty and unparseable strings', () => {
    expect(safeCoverUrl('')).toBeNull()
    expect(safeCoverUrl('not a url')).toBeNull()
  })
  test('rejects non-strings', () => {
    expect(safeCoverUrl(42)).toBeNull()
    expect(safeCoverUrl(null)).toBeNull()
    expect(safeCoverUrl(undefined)).toBeNull()
    expect(safeCoverUrl({})).toBeNull()
  })
})
