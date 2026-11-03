import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { failedMessage } from '../errors'
import { href, goReplace, onBack } from '../../router'
import { fetchTrackTitle, parseSpotifyTrackUrl } from '../../domain/spotify'
import { splitLines } from '../../domain/text'
import { createSong, activeSongCount, LIMIT_NOTE, MAX_OPEN_SONGS } from '../../domain/ingest'
import { Icon } from '../components/Icon'


export function AddSong() {
  const { db, fetch, now } = useDeps()
  const open = useLive(() => activeSongCount(db), [db])
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [known, setKnown] = useState(50)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [linkLeft, setLinkLeft] = useState(false)

  const linkRef = useRef<HTMLInputElement>(null)

  const full = (open ?? 0) >= MAX_OPEN_SONGS
  const canSubmit = splitLines(text).length > 0 && !full && !busy
  const canonical = parseSpotifyTrackUrl(link)
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
    if (found) setTitle((cur) => (cur.trim() === '' ? found : cur))
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
    setBusy(true)
    setError('')
    try {
      if ((await activeSongCount(db)) >= MAX_OPEN_SONGS) {
        setBusy(false)
        return
      }
      // Link incollato per ultimo o Spotify lento: senza titolo scritto si aspetta quello di Spotify (massimo 4 s).
      let finalTitle = title.trim()
      if (!finalTitle && canonical) {
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000))
        finalTitle = ((await Promise.race([titleFor(canonical), timeout])) ?? '').trim()
      }
      const song = await createSong(
        db,
        {
          title: finalTitle || 'Senza titolo',
          artist: artist.trim(),
          spotifyUrl: canonical,
          rawText: text,
          comprehensionBefore: known,
        },
        now(),
      )
      goReplace({ name: 'analyzing', songId: song.id })
    } catch (e) {
      setError(failedMessage('Canzone non salvata', e))
      setBusy(false)
    }
  }

  return (
    <main class="screen add-song">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBack({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
        <h1>Aggiungi canzone</h1>
      </header>
      <form class="add-form" onSubmit={submit}>
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
              Questo non è il link di un brano Spotify. In Spotify tocca Condividi → Copia link del brano, oppure lascia il campo vuoto.
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
                value={known}
                onInput={(e) => setKnown(Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
            <output class="mono range-value">{known}%</output>
          </div>
          {canonical && (
            <a href={canonical} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
          )}
        </section>

        <section>
          <h2 class="section-label">3 · INCOLLA IL TESTO</h2>
          <label class="field">
            <span>Testo</span>
            <textarea
              class="lyrics"
              rows={10}
              value={text}
              onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
            />
          </label>
        </section>

        {full && <p class="note danger" role="status">{LIMIT_NOTE}</p>}
        {error && <p class="note danger" role="alert">{error}</p>}
        <button type="submit" class="btn primary cta" disabled={!canSubmit}>Analizza con Gemini</button>
        <p class="note center">1 chiamata · offline? La salviamo e la analizziamo dopo</p>
      </form>
    </main>
  )
}
