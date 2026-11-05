import type { ComponentChildren } from 'preact'
import type { Song } from '../../db/types'
import { Cover } from './Cover'
import { songLook, SOURCE_LABEL } from '../cover'

const weekdayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })

/** «OGGI · giovedì 5». */
export function todayKicker(now: Date): string {
  return `OGGI · ${weekdayFmt.format(now).toLocaleLowerCase('it')} ${now.getDate()}`
}

type Props = {
  /** La canzone del giorno (`todaySong`); senza, la testata resta senza copertina né tinta. */
  song: Song | null
  /** Dove porta la canzone: lo Studio, o l'analisi per bozze e code. */
  href: string | null
  now: Date
  /** Anello del giorno, ritmo della settimana e note. */
  children: ComponentChildren
}

/** Testata di Oggi, come un lettore musicale: la canzone del giorno guida, sotto l'anello e il ritmo. */
export function TodayHero({ song, href, now, children }: Props) {
  const hue = song ? ` song-hue-${songLook(song.id).hue}` : ''
  const byline = song ? (song.kind === 'text' ? SOURCE_LABEL[song.source ?? 'altro'] : song.artist.trim()) : ''
  return (
    <section class={`today-hero${song ? '' : ' today-hero--plain'}${hue}`}>
      <h1 class="visually-hidden">Ripasso di oggi</h1>
      {song && href ? (
        <div class="today-hero-song">
          <Cover song={song} size="lg" />
          <div class="today-hero-text">
            <p class="today-hero-kicker">{todayKicker(now)}</p>
            {/* Il link si allarga a tutto il blocco (copertina compresa): un solo bersaglio, un solo nome. */}
            <a class="today-hero-link" href={href}>
              <span class="today-hero-title">{song.title}</span>
              {byline && <>{' '}<span class="today-hero-artist">{byline}</span></>}
            </a>
          </div>
        </div>
      ) : (
        <p class="today-hero-kicker">{todayKicker(now)}</p>
      )}
      <div class="today-hero-panel">{children}</div>
    </section>
  )
}
