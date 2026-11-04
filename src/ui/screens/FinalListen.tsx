import { useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { goReplace, href, onBack, onBackTo } from '../../router'
import { saveFinalListen } from '../../domain/finalListen'
import { Icon } from '../components/Icon'
import { plural } from '../plural'

/** Riascolto finale: dopo lo studio si riascolta senza testo e si segna di nuovo quanto si capisce. */
export function FinalListen({ songId }: { songId: string }) {
  const { db, now } = useDeps()
  const data = useLive(async () => {
    const song = (await db.songs.get(songId)) ?? null
    const items = song ? (await db.chunks.toArray()).filter((c) => !c.suspended && c.contexts.some((x) => x.songId === songId)).length : 0
    return { song, items }
  }, [db, songId])
  const [after, setAfter] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <main class="screen final-listen" aria-busy="true" />
  const { song, items } = data
  if (!song) {
    return (
      <main class="screen">
        <h1>Canzone non trovata</h1>
        <p class="note">Forse è stata eliminata, o il link è sbagliato.</p>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }
  const before = song.comprehensionBefore
  const gain = after !== null && before !== null ? after - before : null

  const close = async () => {
    if (after === null) return
    setBusy(true)
    try {
      await saveFinalListen(db, songId, after, now())
      goReplace({ name: 'today' })
    } catch (e) {
      reportError(e)
      setBusy(false)
    }
  }

  return (
    <main class="screen final-listen">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'today' })} onClick={onBack({ name: 'today' })} aria-label="Indietro"><Icon name="back" /></a>
        <div class="grow">
          <h1>Riascolto finale</h1>
          <p class="note">{song.title}</p>
        </div>
      </header>
      <p class="intro">Ascoltala senza guardare il testo, come la prima volta. Poi rispondi alla stessa domanda.</p>
      {song.spotifyUrl && <a class="btn outline" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>}

      <section class="card">
        <div class="range-row">
          <label class="field grow">
            <span>Quanto hai capito adesso?</span>
            <input type="range" min={0} max={100} step={1} value={after ?? before ?? 50}
              onInput={(e) => setAfter(Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <output class="mono range-value">{after === null ? '—' : `${after}%`}</output>
        </div>
      </section>

      {after !== null && (
        <section class="result" aria-label="Risultato">
          <div class="result-bars">
            {before !== null && (
              <>
                <span class="note">{`Prima ${before}%`}</span>
                <div class="result-bar"><div class="result-fill before" style={{ width: `${before}%` }} /></div>
              </>
            )}
            <span class="note">{`Dopo ${after}%`}</span>
            <div class="result-bar"><div class="result-fill" style={{ width: `${after}%` }} /></div>
          </div>
          {gain !== null && (
            <div class="result-gain"><span class="gain-num">{gain > 0 ? `+${gain}` : String(gain)}</span><span class="note">punti</span></div>
          )}
          <p class="note result-note">{`${items > 0 ? `I suoi ${plural(items, 'chunk resta', 'chunk restano')} nel ripasso. ` : ''}La canzone passa tra le completate.`}</p>
        </section>
      )}

      <button type="button" class="btn primary cta final-cta" disabled={after === null || busy} onClick={() => void close()}>Chiudi la canzone</button>
    </main>
  )
}
