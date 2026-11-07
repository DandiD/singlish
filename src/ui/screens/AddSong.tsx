import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { failedMessage } from '../errors'
import { href, goReplace, onBack } from '../../router'
import { fetchTrackTitle, parseSpotifyTrackUrl } from '../../domain/spotify'
import { splitLines } from '../../domain/text'
import { lyricsSearchUrl } from '../../domain/lyricsSearch'
import { createSong, activeSongCount, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import { Icon } from '../components/Icon'
import { ensureCover } from '../../domain/cover'
import { reportError } from '../report'
import type { TextSource } from '../../db/types'


/** Un link che non è di un brano Spotify: cosa fare. */
export const LINK_ERROR = 'Questo non è il link di un brano Spotify. In Spotify tocca Condividi → Copia link del brano, oppure lascia il campo vuoto.'

// Bozza del modulo: per ascoltare la canzone o copiare il testo si esce dall'app, e iOS può chiuderla.
const draftKey = (kind: 'song' | 'text') => (kind === 'text' ? 'singlish:add-text-draft' : 'singlish:add-song-draft')
type Draft = { link: string; title: string; artist: string; known: number | null; text: string; auto: { url: string; title: string } | null; source?: TextSource }
const EMPTY: Draft = { link: '', title: '', artist: '', known: null, text: '', auto: null }
function readDraft(key: string): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Draft> | null
    return d && typeof d === 'object' ? { ...EMPTY, ...d } : EMPTY
  } catch {
    return EMPTY
  }
}
function writeDraft(key: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d))
    else localStorage.removeItem(key)
  } catch {
    // spazio pieno o storage bloccato: la bozza è un aiuto, non un dato
  }
}

const SOURCES: [TextSource, string][] = [['serie', 'Serie'], ['podcast', 'Podcast'], ['articolo', 'Articolo'], ['altro', 'Altro']]

/** Aggiungi canzone; con `kind="text"` Aggiungi testo (serie, podcast, articolo): stessa analisi, senza Spotify. */
export function AddSong({ kind = 'song' }: { kind?: 'song' | 'text' }) {
  const { db, fetch, now } = useDeps()
  const open = useLive(() => activeSongCount(db), [db])
  const key = draftKey(kind)
  const isText = kind === 'text'
  const [draft] = useState(() => readDraft(key))
  const [source, setSource] = useState<TextSource>(draft.source ?? 'serie')
  const [link, setLink] = useState(draft.link)
  const [title, setTitle] = useState(draft.title)
  const [artist, setArtist] = useState(draft.artist)
  // null = non indicata: non si salva un 50% che l'utente non ha scelto
  const [known, setKnown] = useState<number | null>(draft.known)
  const [text, setText] = useState(draft.text)
  // Il titolo messo da Spotify, e per quale link: se si corregge il link, si aggiorna anche lui.
  const auto = useRef(draft.auto)
  const mounted = useRef(true)
  const saved = useRef(false)
  useEffect(() => () => { mounted.current = false }, [])
  useEffect(() => {
    if (!saved.current) writeDraft(key, { link, title, artist, known, text, auto: auto.current, source })
  }, [link, title, artist, known, text, source])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkLeft, setLinkLeft] = useState(false)

  const linkRef = useRef<HTMLInputElement>(null)

  const full = (open ?? 0) >= MAX_OPEN_SONGS
  const canSubmit = splitLines(text).length > 0 && !full && !busy
  const canonical = parseSpotifyTrackUrl(link)
  const lyricsUrl = isText ? null : lyricsSearchUrl(title, artist)
  // Si segnala solo dopo aver lasciato il campo: mentre si incolla o si scrive non disturba.
  const badLink = linkLeft && link.trim() !== '' && !canonical

  // Il titolo da Spotify si chiede una volta per link; l'invio aspetta la stessa richiesta se è ancora in corso.
  const lookup = useRef<{ url: string; title: Promise<string | null> } | null>(null)
  const titleFor = (url: string) => {
    if (lookup.current?.url !== url) lookup.current = { url, title: fetchTrackTitle(url, fetch) }
    return lookup.current.title
  }

  const onLinkBlur = async (e: Event) => {
    setLinkLeft(true)
    const url = parseSpotifyTrackUrl((e.currentTarget as HTMLInputElement).value)
    if (!url) return
    const found = await titleFor(url)
    if (!found || !mounted.current) return
    setTitle((cur) => {
      if (cur.trim() !== '' && cur !== auto.current?.title) return cur // scritto a mano: vince
      auto.current = { url, title: found }
      return found
    })
  }

  // addEventListener diretto: 'blur' non risale e così funziona anche con eventi sintetici.
  useEffect(() => {
    const el = linkRef.current
    if (!el) return
    const h = (e: Event) => void onLinkBlur(e)
    el.addEventListener('blur', h)
    return () => el.removeEventListener('blur', h)
  })

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!canSubmit) return
    // Un link che non è di un brano non si scarta in silenzio: lo si dice e si torna al campo.
    if (link.trim() !== '' && !canonical) {
      setLinkLeft(true)
      linkRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    const page = window.location.hash
    // Se mentre si aspetta l'utente è andato altrove, la canzone non si crea e non lo si riporta indietro.
    const left = () => !mounted.current || window.location.hash !== page
    try {
      if ((await activeSongCount(db)) >= MAX_OPEN_SONGS) {
        setBusy(false)
        return
      }
      // Link incollato per ultimo o Spotify lento: senza titolo scritto si aspetta quello di Spotify (massimo 4 s).
      let finalTitle = title.trim()
      const staleAuto = auto.current !== null && title === auto.current.title && auto.current.url !== canonical
      if ((!finalTitle || staleAuto) && canonical) {
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000))
        finalTitle = ((await Promise.race([titleFor(canonical), timeout])) ?? '').trim()
      } else if (staleAuto) {
        finalTitle = '' // il titolo era di un link che non c'è più
      }
      if (left()) return
      const song = await createSong(
        db,
        {
          title: finalTitle || 'Senza titolo',
          artist: artist.trim(),
          spotifyUrl: canonical,
          rawText: text,
          comprehensionBefore: isText ? null : known,
          ...(isText ? { kind: 'text' as const, source } : {}),
        },
        now(),
      )
      // La copertina si cerca in sottofondo: la navigazione non la aspetta.
      void ensureCover(db, song.id, fetch).catch(reportError)
      saved.current = true
      writeDraft(key, null)
      // Uscito mentre salvava: la canzone resta fra le bozze in Canzoni, la navigazione dell'utente non si annulla.
      if (!left()) goReplace({ name: 'analyzing', songId: song.id })
    } catch (e) {
      setError(failedMessage(isText ? 'Testo non salvato' : 'Canzone non salvata', e))
      setBusy(false)
    }
  }

  return (
    <main class="screen add-song">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBack({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
        {isText ? (
          <div class="grow">
            <h1>Aggiungi testo</h1>
            <p class="note">Oltre le canzoni: serie, podcast, articoli</p>
          </div>
        ) : (
          <h1>Aggiungi canzone</h1>
        )}
      </header>
      <form class="add-form" onSubmit={submit}>
        {isText ? (
          <>
        <section>
          <h2 class="section-label" id="source-label">DA DOVE VIENE</h2>
          <div class="chips-row" role="group" aria-labelledby="source-label">
            {SOURCES.map(([v, label]) => (
              <button key={v} type="button" class="filter-chip" aria-pressed={source === v} onClick={() => setSource(v)}>{label}</button>
            ))}
          </div>
          <label class="field">
            <span>Titolo</span>
            <input type="text" value={title} onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)} />
          </label>
        </section>

          </>
        ) : (
          <>
        <section>
          <h2 class="section-label">1 · LINK SPOTIFY</h2>
          <label class="field">
            <span>Link Spotify</span>
            <input
              type="url"
              inputMode="url"
              autocomplete="off"
              placeholder="https://open.spotify.com/track/…"
              value={link}
              onInput={(e) => {
                setLink((e.currentTarget as HTMLInputElement).value)
                setLinkLeft(false)
              }}
              ref={linkRef}
              aria-invalid={badLink ? 'true' : undefined}
              aria-describedby={badLink ? 'link-error' : undefined}
            />
          </label>
          {badLink && (
            <p class="note danger" id="link-error">
              {LINK_ERROR}
            </p>
          )}
          <div class="grid2">
            <label class="field">
              <span>Titolo</span>
              <input
                type="text"
                value={title}
                onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="field">
              <span>Artista</span>
              <input
                type="text"
                value={artist}
                onInput={(e) => setArtist((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
        </section>

        <section class="card">
          <h2 class="section-label">2 · ASCOLTALA SENZA TESTO</h2>
          <div class="range-row">
            <label class="field grow">
              <span>Quanto hai capito?</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={known ?? 50}
                onInput={(e) => setKnown(Number((e.currentTarget as HTMLInputElement).value))}
                // Toccarlo senza spostarlo (o un tasto) vale come risposta, come nel Riascolto finale.
                onPointerUp={(e) => setKnown(Number((e.currentTarget as HTMLInputElement).value))}
                onKeyUp={(e) => setKnown(Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
            <output class="mono range-value">{known === null ? '—' : `${known}%`}</output>
          </div>
          {canonical && (
            <a href={canonical} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
          )}
        </section>

          </>
        )}
        <section>
          {!isText && <h2 class="section-label">3 · INCOLLA IL TESTO</h2>}
          <label class="field">
            <span>{isText ? 'Testo incollato' : 'Testo'}</span>
            <textarea
              class="lyrics"
              rows={10}
              value={text}
              onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
            />
          </label>
          {lyricsUrl && (
            <a class="out-link" href={lyricsUrl} target="_blank" rel="noopener noreferrer">Cerca il testo su Google ↗</a>
          )}
        </section>

        {isText && (
          <p class="note info-box">Stessa analisi delle canzoni, senza note di pronuncia del canto. Nessun riascolto finale: quando chunk e parole sono nel ripasso, lo segni come completato dallo Studio e liberi il posto.</p>
        )}
        {full && <p class="note danger" role="status">{LIMIT_NOTE}</p>}
        {error && <p class="note danger" role="alert">{error}</p>}
        <button type="submit" class="btn primary cta" disabled={!canSubmit}>Analizza con Gemini</button>
        <p class="note center">{isText ? '1 chiamata · offline? Lo salviamo e lo analizziamo dopo' : '1 chiamata · offline? La salviamo e la analizziamo dopo'}</p>
      </form>
    </main>
  )
}
