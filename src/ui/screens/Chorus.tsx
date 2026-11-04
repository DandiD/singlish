import { useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { goBackTo, href, onBack, onBackTo, stillHere } from '../../router'
import { chorusLines } from '../../domain/chorus'
import { Icon } from '../components/Icon'

/** Ritornello a voce (canvas: Chorus): si canta con Spotify e si coprono le righe che si sanno già. */
export function Chorus({ songId }: { songId: string }) {
  const { db, now } = useDeps()
  const song = useLive(async () => (await db.songs.get(songId)) ?? null, [db, songId])
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [attempt, setAttempt] = useState(1)

  if (song === undefined) return <main class="screen chorus" aria-busy="true" />
  if (song === null) {
    return (
      <main class="screen">
        <h1>Canzone non trovata</h1>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }
  const lines = chorusLines(song.lines)
  const toggle = (i: number) => setHidden((cur) => { const n = new Set(cur); if (n.has(i)) n.delete(i); else n.add(i); return n })
  // Un doppio tocco salva e torna indietro una volta sola.
  const acting = useRef(false)
  const done = async () => {
    if (acting.current) return
    acting.current = true
    const here = stillHere()
    try {
      await db.songs.update(songId, { chorusDoneAt: now() })
      if (here()) goBackTo({ name: 'study', songId })
    } catch (e) {
      acting.current = false
      reportError(e)
    }
  }
  return (
    <main class="screen chorus">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'study', songId })} onClick={onBack({ name: 'study', songId })} aria-label="Indietro"><Icon name="back" /></a>
        <div class="grow">
          <h1>Ritornello a voce</h1>
          <p class="note">{`${song.title} · tentativo ${attempt}`}</p>
        </div>
      </header>
      <p class="note info-box">{song.spotifyUrl ? 'Apri Spotify e canta in sincrono.' : 'Fai partire la canzone e canta in sincrono.'} Copri le righe che sai già: tocca una riga per nasconderla.</p>
      <div class="chorus-lines" lang="en">
        {lines.map((l, i) => (
          <button key={i} type="button" class="chorus-line" aria-pressed={hidden.has(i)} aria-label={l} onClick={() => toggle(i)}>
            {hidden.has(i) ? '• • • • • • • •' : l}
          </button>
        ))}
      </div>
      <footer class="chorus-foot">
        {song.spotifyUrl && <a class="btn outline" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>}
        <div class="grid2">
          <button type="button" class="btn outline" onClick={() => setAttempt((a) => a + 1)}>Ancora</button>
          <button type="button" class="btn primary" onClick={() => void done()}>Ce l'ho, senza testo</button>
        </div>
      </footer>
    </main>
  )
}
