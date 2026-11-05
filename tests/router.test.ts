import { describe, expect, test } from 'vitest'
import { href, navDirection, parseRoute } from '../src/router'

test('parseRoute maps hashes', () => {
  expect(parseRoute('')).toEqual({ name: 'today' })
  expect(parseRoute('#/songs/new')).toEqual({ name: 'addSong' })
  expect(parseRoute('#/songs/abc')).toEqual({ name: 'study', songId: 'abc' })
  expect(parseRoute('#/songs/abc?item=x1')).toEqual({ name: 'study', songId: 'abc', itemId: 'x1' })
  expect(parseRoute('#/songs/abc/triage')).toEqual({ name: 'triage', songId: 'abc' })
  expect(parseRoute('#/songs/abc/read')).toEqual({ name: 'readAlong', songId: 'abc' })
  expect(parseRoute('#/nope')).toEqual({ name: 'notFound' })
})

test('parseRoute falls back to notFound on malformed hash', () => {
  expect(parseRoute('#/songs/%')).toEqual({ name: 'notFound' })
  expect(parseRoute('#/songs/%E0')).toEqual({ name: 'notFound' })
})

test('href round-trips', () => {
  const r = { name: 'analyzing', songId: 'z' } as const
  expect(parseRoute(href(r))).toEqual(r)
  expect(href({ name: 'readAlong', songId: 'a b' })).toBe('#/songs/a%20b/read')
  expect(parseRoute(href({ name: 'readAlong', songId: 'a b' }))).toEqual({ name: 'readAlong', songId: 'a b' })
})

describe('navDirection', () => {
  test('entrare in profondità va avanti, risalire torna indietro', () => {
    expect(navDirection({ name: 'today' }, { name: 'settings' })).toBe('forward')
    expect(navDirection({ name: 'songs' }, { name: 'study', songId: 'a' })).toBe('forward')
    expect(navDirection({ name: 'study', songId: 'a' }, { name: 'triage', songId: 'a' })).toBe('forward')
    expect(navDirection({ name: 'triage', songId: 'a' }, { name: 'study', songId: 'a' })).toBe('back')
    expect(navDirection({ name: 'session' }, { name: 'today' })).toBe('back')
    expect(navDirection({ name: 'study', songId: 'a' }, { name: 'readAlong', songId: 'a' })).toBe('forward')
    expect(navDirection({ name: 'readAlong', songId: 'a' }, { name: 'chorus', songId: 'a' })).toBe('fade')
  })
  test('tra schede allo stesso livello solo dissolvenza', () => {
    expect(navDirection({ name: 'today' }, { name: 'songs' })).toBe('fade')
  })
  test('aprire o chiudere la scheda di un elemento non anima la pagina', () => {
    expect(navDirection({ name: 'study', songId: 'a' }, { name: 'study', songId: 'a', itemId: 'x' })).toBe('none')
    expect(navDirection({ name: 'study', songId: 'a', itemId: 'x' }, { name: 'study', songId: 'a' })).toBe('none')
    expect(navDirection({ name: 'today' }, { name: 'today' })).toBe('none')
  })
})

test('stillHere: vero finché l\'indirizzo non cambia', async () => {
  const { stillHere } = await import('../src/router')
  window.location.hash = '#/songs/s1/triage'
  const here = stillHere()
  expect(here()).toBe(true)
  window.location.hash = '#/lexicon'
  expect(here()).toBe(false)
})
