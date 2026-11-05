import type { Song } from '../../db/types'
import { Cover } from './Cover'
import { Icon } from './Icon'

export type CarouselItem = {
  song: Pick<Song, 'id' | 'title' | 'kind' | 'coverUrl'>
  href: string
  label: string
  detail: string
  progress: number | null
}

export function SongCarousel({
  items,
  onAdd,
  addHref,
}: {
  items: CarouselItem[]
  onAdd: (() => void) | null
  addHref: string
}) {
  return (
    <ul class="song-carousel">
      {items.map((it) => (
        <li key={it.song.id}>
          <a class="song-carousel-item" href={it.href}>
            <span
              class={it.progress === null ? 'song-carousel-frame' : 'song-carousel-frame song-carousel-ring'}
              style={it.progress === null ? undefined : { '--p': `${it.progress}turn` }}
            >
              <Cover song={it.song} size="md" />
            </span>
            <h3 class="song-carousel-title">{it.song.title}</h3>
            <span class="song-carousel-label">{it.label}</span>
            <span class="visually-hidden">{it.detail}</span>
          </a>
        </li>
      ))}
      {onAdd && (
        <li>
          <a
            class="song-carousel-item"
            href={addHref}
            onClick={(e) => {
              e.preventDefault()
              onAdd()
            }}
          >
            <span class="song-carousel-add" aria-hidden="true">
              <Icon name="plus" />
            </span>
            <span class="song-carousel-title">Aggiungi</span>
          </a>
        </li>
      )}
    </ul>
  )
}
