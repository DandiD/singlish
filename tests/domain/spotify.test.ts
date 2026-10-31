import { describe, expect, test, vi } from 'vitest'
import { fetchTrackTitle, parseSpotifyTrackUrl } from '../../src/domain/spotify'

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
