import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { reportError } from '../report'
import { fetchTrackTitle, parseSpotifyTrackUrl } from '../../domain/spotify'
import { LINK_ERROR } from './AddSong'
import { useDeps } from '../deps'
import { href } from '../../router'
import { activeSongCount, deleteSong, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import type { Song } from '../../db/types'
import { Icon } from '../components/Icon'


export function statusLabel(status: Song['status']): string {
  switch (status) {
    case 'draft':
    case 'queued':
      return 'Da analizzare'
    case 'analyzed':
      return 'Da studiare'
    case 'studying':
      return 'In studio'
    case 'done':
      return 'Completata'
  }
}

/** Cosa succede alle voci di una canzone eliminata. */
export const DELETE_NOTE = 'Le sue espressioni e parole escono dal ripasso; quelle che compaiono anche in altre canzoni restano.'

const SOURCE_LABEL = { serie: 'Serie', podcast: 'Podcast', articolo: 'Articolo', altro: 'Testo' } as const

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })

export function Songs() {
  const { db } = useDeps()
  const songs = useLive(() => db.songs.orderBy('addedAt').reverse().toArray(), [db])
  const open = useLive(() => activeSongCount(db), [db])
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  if (!songs || open === undefined) return <main class="screen" aria-busy="true" />
  const full = open >= MAX_OPEN_SONGS

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
      {full ? <p class="note">{LIMIT_NOTE}</p> : (
        <a class="link-add" href={href({ name: 'addText' })}><Icon name="plus" size={18} />Aggiungi testo</a>
      )}
      {songs.length === 0 && <p class="note">Nessuna canzone. Aggiungine una per cominciare.</p>}
      <ul class="song-list">
        {songs.map((s) => editing === s.id ? (
          <li class="song-card" key={s.id}>
            <SongEdit song={s} onDone={() => setEditing(null)} />
          </li>
        ) : (
          <li class="song-card" key={s.id}>
            <div class="song-top">
              <h2>{s.title}</h2>
              <span class="badge">{statusLabel(s.status)}</span>
            </div>
            <p class="note">
              {s.kind === 'text' ? `${SOURCE_LABEL[s.source ?? 'altro']} · ` : s.artist ? `${s.artist} · ` : ''}aggiunta il {dateFmt.format(s.addedAt)}
            </p>
            {s.comprehensionBefore !== null && <p class="mono">{s.comprehensionBefore}% prima</p>}
            <div class="song-actions">
              {(s.status === 'queued' || s.status === 'draft') && (
                <a class="btn outline" href={href({ name: 'analyzing', songId: s.id })}>Analizza ora</a>
              )}
              {(s.status === 'analyzed' || s.status === 'studying') && (
                <a class="btn outline" href={href({ name: 'study', songId: s.id })}>Apri</a>
              )}
              {s.spotifyUrl && (
                <a class="btn outline" href={s.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
              )}
              <button type="button" class="btn outline" onClick={() => setEditing(s.id)}>Modifica</button>
              <button type="button" class="btn outline danger" onClick={() => setDeleting(s.id)}>Elimina</button>
            </div>
            {deleting === s.id && (
              <div class="confirm" role="alertdialog" aria-label="Conferma eliminazione">
                <p>{`Eliminare «${s.title}»? ${DELETE_NOTE}`}</p>
                <div class="grid2">
                  <button
                    type="button"
                    class="btn outline danger"
                    onClick={async () => {
                      try {
                        await deleteSong(db, s.id)
                      } catch (e) {
                        reportError(e)
                      }
                      setDeleting(null)
                    }}
                  >
                    Sì, elimina
                  </button>
                  <button type="button" class="btn outline" onClick={() => setDeleting(null)}>Annulla</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}

/** Titolo e artista di una canzone, correggibili in qualunque stato (es. una salvata come «Senza titolo»). */
function SongEdit({ song, onDone }: { song: Song; onDone(): void }) {
  const { db, fetch } = useDeps()
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [link, setLink] = useState(song.spotifyUrl ?? '')
  const [linkLeft, setLinkLeft] = useState(false)
  const [busy, setBusy] = useState(false)
  const canonical = parseSpotifyTrackUrl(link)
  const badLink = linkLeft && link.trim() !== '' && !canonical
  const canSave = title.trim() !== '' && !busy
  // Se la canzone non ha ancora un titolo vero, lo si prende da Spotify; uno scelto dall'utente resta.
  const onLinkBlur = async (value: string) => {
    setLinkLeft(true)
    const url = parseSpotifyTrackUrl(value) // dal campo: lo stato può non essere ancora aggiornato
    if (!url) return
    const found = await fetchTrackTitle(url, fetch)
    if (found) setTitle((cur) => (cur.trim() === '' || cur.trim() === 'Senza titolo' ? found : cur))
  }
  // addEventListener diretto, come in Aggiungi canzone: 'blur' non risale.
  const linkRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = linkRef.current
    if (!el) return
    const h = () => void onLinkBlur(el.value)
    el.addEventListener('blur', h)
    return () => el.removeEventListener('blur', h)
  })
  const save = async () => {
    if (!canSave) return
    if (link.trim() !== '' && !canonical) {
      setLinkLeft(true)
      return
    }
    setBusy(true)
    try {
      await db.songs.update(song.id, { title: title.trim(), artist: artist.trim(), spotifyUrl: canonical })
      onDone()
    } catch (e) {
      reportError(e)
      setBusy(false)
    }
  }
  return (
    <form class="song-edit" onSubmit={(e) => { e.preventDefault(); void save() }}>
      <label class="field">
        <span>Link Spotify</span>
        <input
          type="url"
          inputMode="url"
          autocomplete="off"
          placeholder="https://open.spotify.com/track/…"
          value={link}
          onInput={(e) => { setLink((e.currentTarget as HTMLInputElement).value); setLinkLeft(false) }}
          ref={linkRef}
          aria-invalid={badLink ? 'true' : undefined}
          aria-describedby={badLink ? `link-error-${song.id}` : undefined}
        />
      </label>
      {badLink && <p class="note danger" id={`link-error-${song.id}`}>{LINK_ERROR}</p>}
      <label class="field">
        <span>Titolo</span>
        <input type="text" value={title} onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <label class="field">
        <span>Artista</span>
        <input type="text" value={artist} onInput={(e) => setArtist((e.currentTarget as HTMLInputElement).value)} />
      </label>
      <div class="grid2">
        <button type="submit" class="btn primary" disabled={!canSave}>Salva</button>
        <button type="button" class="btn outline" onClick={onDone}>Annulla</button>
      </div>
    </form>
  )
}
