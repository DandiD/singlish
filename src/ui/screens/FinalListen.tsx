import { useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { goReplace, href, onBack, onBackTo, stillHere } from '../../router'
import { saveFinalListen } from '../../domain/finalListen'
import { rCardStates, unlockedLines } from '../../domain/unlocked'
import { unlockedText } from '../todayText'
import { Icon } from '../components/Icon'

/** Riascolto finale: dopo lo studio si riascolta senza testo e si segna di nuovo quanto si capisce. */
export function FinalListen({ songId }: { songId: string }) {
  const { db, now } = useDeps()
  const data = useLive(async () => {
    const song = (await db.songs.get(songId)) ?? null
    // Gli stessi versi che Oggi e Canzoni contano: una sola fonte, `unlockedLines`.
    let lines = 0
    let unlocked = 0
    if (song) {
      const [chunks, words, rState] = await Promise.all([db.chunks.toArray(), db.words.toArray(), rCardStates(db)])
      const r = unlockedLines(song, chunks, words, rState)
      lines = r.total
      unlocked = r.unlocked
    }
    return { song, lines, unlocked }
  }, [db, songId])
  const [after, setAfter] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <main class="screen final-listen" aria-busy="true" />
  const { song, lines, unlocked } = data
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
  // Aperta dall'indirizzo su una canzone già completata: si mostra il riascolto fatto, senza riscriverlo.
  if (song.status === 'done') {
    const done = song.comprehensionAfter
    const doneGain = done != null && before != null ? done - before : null
    return (
      <main class="screen final-listen">
        <header class="settings-head">
          <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
          <div class="grow">
            <h1>{song.finalListenAt ? 'Riascolto già fatto' : 'Canzone già completata'}</h1>
            <p class="note">{song.title}</p>
          </div>
        </header>
        <p class="intro">{done == null ? 'La canzone è già tra le completate.' : `Dopo lo studio avevi capito il ${done}%${doneGain === null ? '' : ` (${doneGain > 0 ? `+${doneGain}` : doneGain} punti)`}. La canzone è già tra le completate.`}</p>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }
  if (song.status !== 'studying' || song.kind === 'text') {
    return (
      <main class="screen final-listen">
        <header class="settings-head">
          <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
          <div class="grow">
            <h1>Riascolto finale</h1>
            <p class="note">{song.title}</p>
          </div>
        </header>
        <p class="intro">Il riascolto finale è per le canzoni in studio: si propone in Oggi dopo 7 giorni di studio.</p>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }
  const gain = after !== null && before !== null ? after - before : null

  const close = async () => {
    if (after === null) return
    setBusy(true)
    const here = stillHere()
    try {
      await saveFinalListen(db, songId, after, now())
      if (here()) goReplace({ name: 'today' })
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
              onInput={(e) => setAfter(Number((e.currentTarget as HTMLInputElement).value))}
              // Toccare il cursore senza spostarlo (o un tasto) vale come risposta: si conferma la percentuale mostrata.
              onPointerUp={(e) => setAfter(Number((e.currentTarget as HTMLInputElement).value))}
              onKeyUp={(e) => setAfter(Number((e.currentTarget as HTMLInputElement).value))} />
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
          <p class="note result-note">{lines === 0 ? 'La canzone passa tra le completate.' : unlocked < lines ? `${unlockedText(unlocked, lines)}: gli altri si sbloccano con le prossime sessioni. La canzone passa tra le completate.` : `${unlockedText(unlocked, lines)}. La canzone passa tra le completate.`}</p>
        </section>
      )}

      <button type="button" class="btn primary cta final-cta" disabled={after === null || busy} onClick={() => void close()}>Chiudi la canzone</button>
    </main>
  )
}
