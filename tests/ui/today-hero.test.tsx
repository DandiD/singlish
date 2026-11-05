import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { TodayHero } from '../../src/ui/components/TodayHero'
import { songLook } from '../../src/ui/cover'
import type { Song } from '../../src/db/types'

afterEach(cleanup)

// Titoli inventati.
const now = new Date(2026, 10, 5, 10, 0) // giovedì 5 novembre
const song = (over: Partial<Song> = {}): Song => ({
  id: 's1', kind: 'song', title: 'Paper Lanterns', artist: 'The Inventions', spotifyUrl: null, lines: [], status: 'studying',
  level: 'B1', difficultyKnownPct: 70, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
  addedAt: now, analyzedAt: now, studyStartedAt: now, ...over,
})

describe('TodayHero', () => {
  test('song of the day: tint of the song, big cover, kicker, title and artist in one link to the song', () => {
    const { container } = render(<TodayHero song={song()} href="#/songs/s1" now={now}><p>anello</p></TodayHero>)
    const hero = container.querySelector('.today-hero')!
    expect(hero.classList.contains(`song-hue-${songLook('s1').hue}`)).toBe(true)
    expect(screen.getByText('OGGI · giovedì 5')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Paper Lanterns The Inventions' })
    expect(link.getAttribute('href')).toBe('#/songs/s1')
    expect(link.querySelector('.today-hero-title')!.textContent).toBe('Paper Lanterns')
    // La copertina grande è dentro lo stesso blocco cliccabile del titolo.
    expect(container.querySelector('.today-hero-song .cover.cover-lg')).not.toBeNull()
    expect(screen.getByText('anello')).toBeTruthy()
  })

  test('the h1 stays for screen readers, visually hidden', () => {
    render(<TodayHero song={song()} href="#/songs/s1" now={now}>{null}</TodayHero>)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Ripasso di oggi' })
    expect(h1.classList.contains('visually-hidden')).toBe(true)
  })

  test('a free text shows its source instead of the artist', () => {
    render(<TodayHero song={song({ kind: 'text', source: 'podcast', artist: '' })} href="#/songs/s1" now={now}>{null}</TodayHero>)
    expect(screen.getByRole('link', { name: 'Paper Lanterns Podcast' })).toBeTruthy()
  })

  test('a song without artist: only the title', () => {
    render(<TodayHero song={song({ artist: '' })} href="#/songs/s1" now={now}>{null}</TodayHero>)
    expect(screen.getByRole('link', { name: 'Paper Lanterns' })).toBeTruthy()
  })

  test('no song: no cover, no tint, no link; the kicker and the content stay', () => {
    const { container } = render(<TodayHero song={null} href={null} now={now}><p>anello</p></TodayHero>)
    const hero = container.querySelector('.today-hero')!
    expect([...hero.classList].some((c) => c.startsWith('song-hue-'))).toBe(false)
    expect(container.querySelector('.cover')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('OGGI · giovedì 5')).toBeTruthy()
    expect(screen.getByText('anello')).toBeTruthy()
  })
})
