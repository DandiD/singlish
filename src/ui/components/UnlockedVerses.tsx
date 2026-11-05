import type { StrongItem, UnlockedVerse } from '../../domain/unlocked'
import { songLook } from '../cover'
import { plural } from '../plural'
import { Cover } from './Cover'
import { Highlighted } from './Highlighted'

const MAX_VERSES = 6

/** Fine sessione: i versi sbloccati oggi; senza istantanea (`verses === null`) o senza versi, le voci più forti. */
export function UnlockedVerses({ verses, strongest }: { verses: UnlockedVerse[] | null; strongest: StrongItem[] }) {
  if (verses && verses.length > 0) {
    const shown = verses.slice(0, MAX_VERSES)
    const more = verses.length - shown.length
    return (
      <section class="unlocked-end">
        <h2>{`Oggi hai sbloccato ${plural(verses.length, 'verso', 'versi')}`}</h2>
        <ul class="unlocked-list" aria-label="Versi sbloccati">
          {shown.map((v) => (
            <li key={`${v.song.id}:${v.lineIndex}`} class={`unlocked-item song-hue-${songLook(v.song.id).hue}`}>
              <div class="unlocked-song">
                <Cover song={v.song} size="sm" />
                <span class="note">{v.song.title}</span>
              </div>
              <p class="unlocked-line" lang="en"><Highlighted line={v.line} spans={v.spans} /></p>
              {v.translation && <p class="note">{v.translation}</p>}
            </li>
          ))}
        </ul>
        {more > 0 && <p class="note">{more === 1 ? 'e un altro verso' : `e altri ${more} versi`}</p>}
      </section>
    )
  }
  if (strongest.length === 0) return null
  return (
    <section class="unlocked-end">
      <h2>Le voci più forti di oggi</h2>
      <ul class="unlocked-list" aria-label="Voci più forti">
        {strongest.map((s) => (
          <li key={s.itemId} class={`unlocked-item${s.song ? ` song-hue-${songLook(s.song.id).hue}` : ''}`}>
            <p class="unlocked-line" lang="en">{s.text}</p>
            <p class="note">{s.meaningIt}</p>
            {s.song && <p class="note">{s.song.title}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
