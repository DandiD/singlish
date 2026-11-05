import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { createSong } from '../../src/domain/ingest'
import { ensureCover, resetCoverAttempts } from '../../src/domain/cover'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const LINK = 'https://open.spotify.com/track/abc123'
const COVER = 'https://i.scdn.co/image/ab67616d00001e02aaaa'
const OEMBED = `https://open.spotify.com/oembed?url=${encodeURIComponent(LINK)}`

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
  resetCoverAttempts()
})
afterEach(() => {
  db.close()
})

const add = (over: Record<string, unknown> = {}) =>
  createSong(db, { title: 'Paper Lanterns', artist: 'The Night Ferries', spotifyUrl: LINK, rawText: 'a\nb', comprehensionBefore: null, ...over }, now)

const okFetch = (body: object = { thumbnail_url: COVER }) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch

describe('ensureCover', () => {
  test('saves the Spotify cover once', async () => {
    const s = await add()
    const f = okFetch()
    await ensureCover(db, s.id, f)
    expect((await db.songs.get(s.id))!.coverUrl).toBe(COVER)
    await ensureCover(db, s.id, f)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith(OEMBED)
  })

  test('offline: nothing saved, no second try in this app session', async () => {
    const s = await add()
    const f = vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    const tried = new Set<string>()
    await expect(ensureCover(db, s.id, f, tried)).resolves.toBeUndefined()
    expect((await db.songs.get(s.id))!.coverUrl).toBeUndefined()
    await ensureCover(db, s.id, f, tried)
    expect(f).toHaveBeenCalledTimes(1)
    await ensureCover(db, s.id, f, new Set())
    expect(f).toHaveBeenCalledTimes(2)
  })

  test('a non-ok response saves nothing', async () => {
    const s = await add()
    const f = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    await ensureCover(db, s.id, f)
    expect((await db.songs.get(s.id))!.coverUrl).toBeUndefined()
    expect(f).toHaveBeenCalledTimes(1)
  })

  test('Spotify without image saves null', async () => {
    const s = await add()
    await ensureCover(db, s.id, okFetch({ title: 'x' }))
    expect((await db.songs.get(s.id))!.coverUrl).toBeNull()
  })

  test('a cover from a foreign host is saved as null', async () => {
    const s = await add()
    await ensureCover(db, s.id, okFetch({ thumbnail_url: 'https://evil.example/x.jpg' }))
    expect((await db.songs.get(s.id))!.coverUrl).toBeNull()
  })

  test('skips texts', async () => {
    const s = await add({ kind: 'text', spotifyUrl: null })
    await db.songs.update(s.id, { spotifyUrl: LINK })
    const f = okFetch()
    await ensureCover(db, s.id, f)
    expect(f).not.toHaveBeenCalled()
    expect((await db.songs.get(s.id))!.coverUrl).toBeUndefined()
  })

  test('skips songs without link', async () => {
    const s = await add({ spotifyUrl: null })
    const f = okFetch()
    await ensureCover(db, s.id, f)
    expect(f).not.toHaveBeenCalled()
  })

  test('skips songs that already have a cover, also null', async () => {
    const a = await add()
    const b = await add()
    await db.songs.update(a.id, { coverUrl: COVER })
    await db.songs.update(b.id, { coverUrl: null })
    const f = okFetch()
    await ensureCover(db, a.id, f)
    await ensureCover(db, b.id, f)
    expect(f).not.toHaveBeenCalled()
    expect((await db.songs.get(a.id))!.coverUrl).toBe(COVER)
    expect((await db.songs.get(b.id))!.coverUrl).toBeNull()
  })

  test('skips a song that does not exist', async () => {
    const f = okFetch()
    await expect(ensureCover(db, 'missing', f)).resolves.toBeUndefined()
    expect(f).not.toHaveBeenCalled()
  })

  test('link changed during the request: nothing saved', async () => {
    const s = await add()
    const other = 'https://open.spotify.com/track/zzz999'
    const f = vi.fn(async () => {
      await db.songs.update(s.id, { spotifyUrl: other })
      return new Response(JSON.stringify({ thumbnail_url: COVER }), { status: 200 })
    }) as unknown as typeof fetch
    await ensureCover(db, s.id, f)
    expect(f).toHaveBeenCalledTimes(1)
    const stored = (await db.songs.get(s.id))!
    expect(stored.spotifyUrl).toBe(other)
    expect(stored.coverUrl).toBeUndefined()
  })

  test('resetCoverAttempts makes a retry possible (default session set)', async () => {
    const s = await add()
    const f = vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    await ensureCover(db, s.id, f)
    await ensureCover(db, s.id, f)
    expect(f).toHaveBeenCalledTimes(1)
    resetCoverAttempts()
    await ensureCover(db, s.id, f)
    expect(f).toHaveBeenCalledTimes(2)
  })

  test('a changed link gets a new attempt even if the old one was tried', async () => {
    const s = await add()
    const tried = new Set<string>()
    const bad = vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof fetch
    await ensureCover(db, s.id, bad, tried)
    const other = 'https://open.spotify.com/track/zzz999'
    await db.songs.update(s.id, { spotifyUrl: other })
    const f = okFetch()
    await ensureCover(db, s.id, f, tried)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith(`https://open.spotify.com/oembed?url=${encodeURIComponent(other)}`)
    expect((await db.songs.get(s.id))!.coverUrl).toBe(COVER)
  })

  test('an IndexedDB failure rejects', async () => {
    const s = await add()
    const f = okFetch()
    vi.spyOn(db.songs, 'get').mockRejectedValue(new Error('db down'))
    await expect(ensureCover(db, s.id, f)).rejects.toThrow('db down')
    expect(f).not.toHaveBeenCalled()
  })
})
