import { expect, test } from 'vitest'
import { href, parseRoute } from '../src/router'

test('parseRoute maps hashes', () => {
  expect(parseRoute('')).toEqual({ name: 'today' })
  expect(parseRoute('#/songs/new')).toEqual({ name: 'addSong' })
  expect(parseRoute('#/songs/abc')).toEqual({ name: 'study', songId: 'abc' })
  expect(parseRoute('#/songs/abc?item=x1')).toEqual({ name: 'study', songId: 'abc', itemId: 'x1' })
  expect(parseRoute('#/songs/abc/triage')).toEqual({ name: 'triage', songId: 'abc' })
  expect(parseRoute('#/nope')).toEqual({ name: 'notFound' })
})

test('parseRoute falls back to notFound on malformed hash', () => {
  expect(parseRoute('#/songs/%')).toEqual({ name: 'notFound' })
  expect(parseRoute('#/songs/%E0')).toEqual({ name: 'notFound' })
})

test('href round-trips', () => {
  const r = { name: 'analyzing', songId: 'z' } as const
  expect(parseRoute(href(r))).toEqual(r)
})
