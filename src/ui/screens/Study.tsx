import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { href, goBackTo, onBack, onBackTo } from '../../router'
import { getSettings } from '../../domain/settings'
import { pendingWords } from '../../domain/triage'
import { startTimer } from '../../domain/timer'
import { useTimer } from '../useTimer'
import { TimerPill } from '../components/TimerPill'
import { Highlighted } from '../components/Highlighted'
import { CHUNK_CLASS, itemsInSong } from '../../domain/songItems'
import { ItemSheet } from './ItemSheet'

import { Icon } from '../components/Icon'
import { plural } from '../plural'
import { newId } from '../../domain/id'

const LEGEND: [string, string][] = [
  ['pv', 'phrasal verb'], ['id', 'idioma'], ['co', 'collocazione'], ['sl', 'slang'], ['w', 'parola'], ['cs', 'pronuncia'],
]

export function Study({ songId, itemId }: { songId: string; itemId?: string }) {
  const { db, now } = useDeps()
  const [sessionId, setSessionId] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let alive = true
    const id = newId()
    void (async () => {
      const s = await getSettings(db)
      const t = Date.now()
      await db.sessions.add({
        id, kind: 'study', songId, startedAt: now(), endedAt: null,
        timer: startTimer(s.timerMinutes.study * 60_000, t), reviewsDone: 0, newDone: 0,
      })
      if (alive) setSessionId(id)
    })()
    return () => { alive = false }
  }, [db, songId])

  // Aprire lo Studio di una canzone tenuta per più avanti la mette in studio: da qui le sue card nuove entrano nel ripasso.
  useEffect(() => {
    db.songs.where('id').equals(songId).filter((s) => s.status === 'analyzed').modify({ status: 'studying' }).catch(reportError)
  }, [db, songId])

  const timer = useTimer(sessionId, { autoPauseOnHide: true, wakeLock: false }, db)
  const timerRef = useRef(timer)
  timerRef.current = timer
  useEffect(() => () => { timerRef.current.pause() }, [])

  const data = useLive(async () => {
    const song = (await db.songs.get(songId)) ?? null
    const chunks = (await db.chunks.toArray()).filter((c) => c.contexts.some((x) => x.songId === songId))
    const words = (await db.words.toArray()).filter((w) => w.contexts.some((x) => x.songId === songId) || w.songId === songId)
    const pending = (await pendingWords(db, songId)).length
    return { song, chunks, words, pending }
  }, [db, songId])

  if (!data) return <main class="screen" aria-busy="true" />
  const { song, chunks, words, pending } = data
  if (!song) {
    return (
      <main class="screen">
        <h1>Canzone non trovata</h1>
        <p class="note">Forse è stata eliminata, o il link è sbagliato.</p>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }

  // Le voci di questa canzone: le stesse per l'evidenziazione nel testo e per i conteggi in testa (e per Oggi).
  const placed = itemsInSong(song, chunks, words)
  const hrefFor = (id: string) =>
    id.startsWith('cs:') ? undefined : href({ name: 'study', songId, itemId: id })

  const chunkCount = placed.chunks.size
  const wordCount = placed.words.size
  const gp = song.grammarPoint

  return (
    <main class="screen study">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBack({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
        <div class="grow">
          <h1>{song.title}</h1>
          <p class="note">{`Studio · ${chunkCount} chunk · ${plural(wordCount, 'parola', 'parole')}`}</p>
        </div>
        {sessionId && (
          <TimerPill
            state={timer.state}
            remaining={timer.remaining}
            expired={timer.expired}
            onPause={timer.pause}
            onResume={timer.resume}
          />
        )}
      </header>

      {pending > 0 && (
        <a class="banner" href={href({ name: 'triage', songId })}>
          <span>{`${plural(pending, 'parola nuova', 'parole nuove')} da smistare`}</span>
          <span aria-hidden="true">→</span>
        </a>
      )}

      {gp && (
        <section class="card grammar">
          <div class="section-label">{`GRAMMATICA · RIGA ${gp.lineIndex + 1}`}</div>
          <p><strong>{gp.title}</strong>: {gp.explanationIt}</p>
        </section>
      )}

      <ul class="legend" aria-label="Legenda">
        {LEGEND.map(([cls, text]) => (
          <li key={cls}><span class={`swatch hl ${cls}`} aria-hidden="true" />{text}</li>
        ))}
      </ul>

      <div class="lyrics" lang="en">
        {song.lines.map((l, i) => (
          <p key={i}><Highlighted line={l} spans={placed.spansByLine[i]} hrefFor={hrefFor} /></p>
        ))}
      </div>

      {placed.unshown.length > 0 && (
        <section class="other-items">
          <h2 class="section-label" id="other-items">ALTRE VOCI DI QUESTA CANZONE</h2>
          <ul aria-label="Altre voci di questa canzone">
            {placed.unshown.map((i) => (
              <li key={i.id}>
                <a href={href({ name: 'study', songId, itemId: i.id })} lang="en">
                  <span class={`hl ${'type' in i ? CHUNK_CLASS[i.type] : 'w'}`}>{'type' in i ? i.baseForm : i.lemma}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {song.spotifyUrl && (
        <footer class="study-foot">
          <a class="btn outline" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
        </footer>
      )}

      <footer class="study-foot">
        {confirming ? (
          <div class="confirm" role="alertdialog" aria-label="Conferma completamento">
            <p>Segnare questa canzone come completata? Libera un posto tra le canzoni aperte.</p>
            <div class="grid2">
              <button type="button" class="btn outline" onClick={() => setConfirming(false)}>Annulla</button>
              <button
                type="button"
                class="btn primary"
                onClick={async () => {
                  try {
                    await db.songs.update(songId, { status: 'done' })
                    goBackTo({ name: 'songs' })
                  } catch (e) {
                    reportError(e)
                    setConfirming(false)
                  }
                }}
              >
                Conferma
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="btn outline" onClick={() => setConfirming(true)}>Segna come completata</button>
        )}
      </footer>

      {itemId && <ItemSheet song={song} itemId={itemId} />}
    </main>
  )
}
