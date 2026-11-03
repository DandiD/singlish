import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { href } from '../../router'
import { activeSongCount, LIMIT_NOTE } from '../../domain/ingest'
import type { Song } from '../../db/types'
import { Icon } from '../components/Icon'

const MAX_OPEN = 4

export function statusLabel(status: Song['status']): string {
  switch (status) {
    case 'draft':
    case 'queued':
      return 'Da analizzare'
    case 'analyzed':
    case 'studying':
      return 'In studio'
    case 'done':
      return 'Completate'
  }
}

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })

export function Songs() {
  const { db } = useDeps()
  const songs = useLive(() => db.songs.orderBy('addedAt').reverse().toArray(), [db])
  const open = useLive(() => activeSongCount(db), [db])

  if (!songs || open === undefined) return <main class="screen" aria-busy="true" />
  const full = open >= MAX_OPEN

  return (
    <main class="screen songs">
      <header class="songs-head">
        <h1>Canzoni</h1>
        <button
          type="button"
          class="btn primary pill"
          disabled={full}
          onClick={() => {
            window.location.hash = href({ name: 'addSong' })
          }}
        >
          <Icon name="plus" size={18} />Aggiungi
        </button>
      </header>
      {full && <p class="note">{LIMIT_NOTE}</p>}
      {songs.length === 0 && <p class="note">Nessuna canzone. Aggiungine una per cominciare.</p>}
      <ul class="song-list">
        {songs.map((s) => (
          <li class="song-card" key={s.id}>
            <div class="song-top">
              <h2>{s.title}</h2>
              <span class="badge">{statusLabel(s.status)}</span>
            </div>
            <p class="note">
              {s.artist ? `${s.artist} · ` : ''}aggiunta il {dateFmt.format(s.addedAt)}
            </p>
            {s.comprehensionBefore !== null && <p class="mono">{s.comprehensionBefore}% prima</p>}
            <div class="song-actions">
              {(s.status === 'queued' || s.status === 'draft') && (
                <a class="btn outline" href={href({ name: 'analyzing', songId: s.id })}>Analizza ora</a>
              )}
              {(s.status === 'analyzed' || s.status === 'studying') && (
                <a class="btn outline" href={href({ name: 'study', songId: s.id })}>Apri</a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
