import { useState } from 'preact/hooks'
import type { Song } from '../../db/types'
import { safeCoverUrl } from '../../domain/spotify'
import { coverInitials, songLook, SOURCE_LABEL, type Motif } from '../cover'

type CoverSong = Pick<Song, 'id' | 'title' | 'kind' | 'coverUrl'> & Partial<Pick<Song, 'source'>>

function MotifArt({ motif }: { motif: Motif }) {
  return (
    <svg
      class="cover-art"
      data-motif={motif}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      stroke-width="4"
      stroke-linecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {motif === 'waves' && (
        <>
          <path d="M-5 30 Q 12 15 30 30 T 65 30 T 105 30" />
          <path d="M-5 55 Q 12 40 30 55 T 65 55 T 105 55" />
          <path d="M-5 80 Q 12 65 30 80 T 65 80 T 105 80" />
        </>
      )}
      {motif === 'circles' && (
        <>
          <circle cx="100" cy="100" r="22" />
          <circle cx="100" cy="100" r="42" />
          <circle cx="100" cy="100" r="62" />
        </>
      )}
      {motif === 'lines' && (
        <>
          <path d="M-10 40 L 60 -30" />
          <path d="M-10 75 L 95 -30" />
          <path d="M5 110 L 110 5" />
          <path d="M40 110 L 110 40" />
        </>
      )}
    </svg>
  )
}

export function Cover({ song, size }: { song: CoverSong; size: 'sm' | 'md' | 'lg' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  // L'errore vale solo per l'URL che l'ha dato: un URL nuovo merita un tentativo.
  // Difesa in profondità: si carica solo ciò che safeCoverUrl accetta (CDN di Spotify, https).
  const url = song.kind === 'text' ? null : safeCoverUrl(song.coverUrl)
  const showImage = url !== null && url !== failedUrl
  const look = songLook(song.id)

  return (
    <span class={`cover cover-${size} song-hue-${look.hue}`} aria-hidden="true">
      {showImage ? (
        <img
          src={url}
          alt=""
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <>
          <MotifArt motif={look.motif} />
          <span class="cover-initials">{coverInitials(song.title)}</span>
          {/* Un testo libero dice la sua fonte al posto di un'icona; troppo piccola la copertina sm per scriverla. */}
          {song.kind === 'text' && size !== 'sm' && <span class="cover-source">{SOURCE_LABEL[song.source ?? 'altro']}</span>}
        </>
      )}
    </span>
  )
}
