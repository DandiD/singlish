import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { reportError } from '../report'
import { useAddGate } from '../components/UnlockSheet'
import { fetchTrackTitle, parseSpotifyTrackUrl } from '../../domain/spotify'
import { LINK_ERROR } from './AddSong'
import { useDeps } from '../deps'
import { href } from '../../router'
import { activeSongCount, deleteSong, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import type { Song } from '../../db/types'
import { Icon } from '../components/Icon'
import { Cover } from '../components/Cover'
import { ensureCover } from '../../domain/cover'
import { rCardStates, unlockedBySong } from '../../domain/unlocked'
import { unlockedText } from '../todayText'
import { MoreMenu, type MoreMenuItem } from '../components/MoreMenu'
import { SOURCE_LABEL } from '../cover'
import { gainText } from '../../domain/path'


export function statusLabel(status: Song['status'], kind: Song['kind'] = 'song'): string {
  switch (status) {
    case 'draft':
    case 'queued':
      return 'Da analizzare'
    case 'analyzed':
      return 'Da studiare'
    case 'studying':
      return 'In studio'
    case 'done':
      return kind === 'text' ? 'Completato' : 'Completata'
  }
}

/** Cosa succede alle voci di una canzone eliminata. */
export const DELETE_NOTE = 'Le sue espressioni e parole escono dal ripasso; quelle che compaiono anche in altre canzoni o testi restano, e le parole che sai, o che hai già ripassato, restano nel tuo profilo come note.'

const dateFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })

export function Songs() {
  const removing = useRef(false)
  const { db } = useDeps()
  const songs = useLive(() => db.songs.orderBy('addedAt').reverse().toArray(), [db])
  const open = useLive(() => activeSongCount(db), [db])
  // «X di Y versi sbloccati» dalla stessa fonte di Oggi: solo per le canzoni in studio e completate.
  const unlocked = useLive(async () => {
    const [all, chunks, words, rState] = await Promise.all([db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), rCardStates(db)])
    return unlockedBySong(all.filter((x) => x.status === 'studying' || x.status === 'done'), chunks, words, rState)
  }, [db])
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const gate = useAddGate()
  // Chiusi modulo o conferma senza eliminare, il fuoco torna al «⋯» della stessa canzone.
  const refocus = useRef<string | null>(null)
  useEffect(() => {
    const id = refocus.current
    if (id === null || editing === id || deleting === id) return
    refocus.current = null
    document.querySelector<HTMLElement>(`[data-song-id="${CSS.escape(id)}"] .more-menu > button`)?.focus()
  })
  const closeEdit = (id: string) => { refocus.current = id; setEditing(null) }

  if (!songs || open === undefined) return <main class="screen" aria-busy="true" />
  const full = open >= MAX_OPEN_SONGS
  const openSongs = songs.filter((s) => s.status !== 'done')
  const doneSongs = songs.filter((s) => s.status === 'done')

  // Titoli: h2 per le aperte (sotto h1 «Canzoni»), h3 per le completate (sotto h2 «Completate»).
  const item = (s: Song) => {
    const u = unlocked?.get(s.id)
    const ring = u && u.total > 0 ? u.unlocked / u.total : null
    const toAnalyze = s.status === 'queued' || s.status === 'draft'
    const gain = s.status === 'done' ? gainText(s) : null
    const actions: MoreMenuItem[] = [
      ...(s.spotifyUrl ? [{ text: 'Apri in Spotify ↗', onSelect: () => { window.open(s.spotifyUrl!, '_blank', 'noopener,noreferrer') } }] : []),
      { text: 'Modifica', onSelect: () => { setDeleting(null); setEditing(s.id) } },
      { text: 'Elimina', danger: true, onSelect: () => { setEditing(null); setDeleting(s.id) } },
    ]
    // Modulo di modifica e conferma di eliminazione occupano tutta la riga della griglia.
    const wide = editing === s.id || deleting === s.id
    return (
      <li class={wide ? 'shelf-item shelf-wide' : 'shelf-item'} key={s.id} data-song-id={s.id}>
        {editing === s.id ? (
          <SongEdit song={s} onDone={() => closeEdit(s.id)} />
        ) : (
          <>
            <div class="shelf-body">
              <a class="shelf-link" href={href(toAnalyze ? { name: 'analyzing', songId: s.id } : { name: 'study', songId: s.id })}>
                <span class={ring === null ? 'shelf-frame' : 'shelf-frame song-carousel-ring'} style={ring === null ? undefined : { '--p': `${ring}turn` }}>
                  <Cover song={s} size="lg" />
                </span>
                {s.status === 'done' ? <h3>{s.title}</h3> : <h2>{s.title}</h2>}
              </a>
              <div class="shelf-more">
                <MoreMenu label={`Azioni per «${s.title}»`} items={actions} />
              </div>
              <p class="shelf-status">
                <span class="badge">{statusLabel(s.status, s.kind)}</span>
                {gain !== null && <span class="shelf-gain mono">{gain}</span>}
                {s.comprehensionBefore !== null && <span class="mono">{s.comprehensionBefore}% prima</span>}
              </p>
              {u && u.total > 0 && <p class="note">{unlockedText(u.unlocked, u.total)}</p>}
              <p class="note">
                {s.kind === 'text' ? `${SOURCE_LABEL[s.source ?? 'altro']} · ` : s.artist ? `${s.artist} · ` : ''}{s.kind === 'text' ? 'aggiunto il' : 'aggiunta il'} {dateFmt.format(s.addedAt)}
              </p>
              {toAnalyze && <a class="btn outline" href={href({ name: 'analyzing', songId: s.id })}>Analizza ora</a>}
            </div>
            {deleting === s.id && (
              <div class="confirm" role="alertdialog" aria-label="Conferma eliminazione">
                <p>{`Eliminare «${s.title}»? ${DELETE_NOTE}`}</p>
                <div class="grid2">
                  <button
                    type="button"
                    class="btn outline danger"
                    onClick={async () => {
                      if (removing.current) return // doppio tocco: una volta sola
                      removing.current = true
                      try {
                        await deleteSong(db, s.id)
                      } catch (e) {
                        reportError(e)
                      }
                      removing.current = false
                      setDeleting(null)
                    }}
                  >
                    Sì, elimina
                  </button>
                  <button type="button" class="btn outline" ref={focusOnMount} onClick={() => { refocus.current = s.id; setDeleting(null) }}>Annulla</button>
                </div>
              </div>
            )}
          </>
        )}
      </li>
    )
  }

  return (
    <main class="screen songs">
      <header class="songs-head">
        <h1>Canzoni</h1>
        <button
          type="button"
          class="btn primary pill"
          disabled={full}
          onClick={() => gate.request()}
        >
          <Icon name="plus" size={18} />Aggiungi
        </button>
      </header>
      {full ? <p class="note">{LIMIT_NOTE}</p> : (
        <a class="link-add" href={href({ name: 'addText' })} onClick={(e) => { e.preventDefault(); gate.request('addText') }}><Icon name="plus" size={18} />Aggiungi testo</a>
      )}
      {songs.length === 0 && <p class="note">Nessuna canzone. Aggiungine una per cominciare.</p>}
      {openSongs.length > 0 && <ul class="shelf">{openSongs.map(item)}</ul>}
      {doneSongs.length > 0 && (
        <>
          <h2 class="shelf-head">Completate</h2>
          <ul class="shelf">{doneSongs.map(item)}</ul>
        </>
      )}
      {gate.sheet}
    </main>
  )
}

/** La conferma di eliminazione prende il fuoco su «Annulla», la scelta che non perde niente. */
function focusOnMount(el: HTMLButtonElement | null) {
  el?.focus()
}

/** Un link diverso rende vecchia la copertina salvata: si azzera, la nuova arriva con ensureCover. */
function coverResetIfLinkChanged(next: string | null, prev: string | null | undefined): { coverUrl?: undefined } {
  return (next ?? null) !== (prev ?? null) ? { coverUrl: undefined } : {}
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
  // Chiuso con Salva o Annulla: uscendo dalla pagina non si salva di nuovo. Altrimenti (barra in basso, Indietro)
  // quello che si è scritto e vale si salva, come la scheda di una voce.
  const closed = useRef(false)
  const latest = useRef({ title, artist, link })
  latest.current = { title, artist, link }
  useEffect(() => () => {
    if (closed.current) return
    const v = latest.current
    // Un link non valido non si salva (resta quello di prima); titolo e artista sì.
    const url = v.link.trim() === '' ? null : parseSpotifyTrackUrl(v.link) ?? song.spotifyUrl
    const changed = v.title.trim() !== song.title || v.artist.trim() !== song.artist || (url ?? null) !== (song.spotifyUrl ?? null)
    if (!changed) return
    // Titolo svuotato: resta quello di prima, ma link e artista scritti si salvano lo stesso.
    const title = v.title.trim() || song.title
    const untitled = title === 'Senza titolo'
    db.songs.update(song.id, { title, artist: v.artist.trim(), spotifyUrl: url, ...coverResetIfLinkChanged(url, song.spotifyUrl) })
      .then(async () => {
        if (url !== (song.spotifyUrl ?? null)) void ensureCover(db, song.id, fetch).catch(reportError)
        // Link nuovo su una canzone senza titolo vero: il titolo di Spotify arriva anche dopo l'uscita, se intanto non è stato scelto.
        if (!untitled || !url || url === song.spotifyUrl) return
        const found = await fetchTrackTitle(url, fetch)
        if (found) await db.songs.where('id').equals(song.id).filter((x) => x.title === 'Senza titolo').modify({ title: found })
      })
      .catch(reportError)
  }, [])
  const save = async () => {
    if (!canSave) return
    if (link.trim() !== '' && !canonical) {
      setLinkLeft(true)
      return
    }
    setBusy(true)
    closed.current = true
    try {
      // Link appena incollato e Salva subito, su una canzone senza titolo vero: si aspetta Spotify (massimo 4 s), come in Aggiungi.
      let finalTitle = title.trim()
      if (canonical && canonical !== song.spotifyUrl && (finalTitle === '' || finalTitle === 'Senza titolo')) {
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000))
        finalTitle = ((await Promise.race([fetchTrackTitle(canonical, fetch), timeout])) ?? '').trim() || finalTitle
      }
      await db.songs.update(song.id, { title: finalTitle, artist: artist.trim(), spotifyUrl: canonical, ...coverResetIfLinkChanged(canonical, song.spotifyUrl) })
      if (canonical !== (song.spotifyUrl ?? null)) void ensureCover(db, song.id, fetch).catch(reportError)
      onDone()
    } catch (e) {
      reportError(e)
      closed.current = false
      setBusy(false)
    }
  }
  // Aperto dal menu «⋯»: il fuoco va sul primo campo.
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { form.current?.querySelector('input')?.focus() }, [])
  return (
    <form class="song-edit" ref={form} onSubmit={(e) => { e.preventDefault(); void save() }}>
      {/* Un testo libero non ha link Spotify né artista: si corregge solo il titolo. */}
      {song.kind !== 'text' && <label class="field">
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
      </label>}
      {badLink && <p class="note danger" id={`link-error-${song.id}`}>{LINK_ERROR}</p>}
      <label class="field">
        <span>Titolo</span>
        <input type="text" value={title} onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
      </label>
      {song.kind !== 'text' && <label class="field">
        <span>Artista</span>
        <input type="text" value={artist} onInput={(e) => setArtist((e.currentTarget as HTMLInputElement).value)} />
      </label>}
      <div class="grid2">
        <button type="submit" class="btn primary" disabled={!canSave}>Salva</button>
        <button type="button" class="btn outline" onClick={() => { closed.current = true; onDone() }}>Annulla</button>
      </div>
    </form>
  )
}
