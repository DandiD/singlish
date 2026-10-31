import { useEffect, useRef, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { href } from '../../router'
import { analyzeSong } from '../../domain/ingest'
import { loadRanks } from '../../domain/freq'
import { GeminiError } from '../../domain/gemini/client'
import type { Song } from '../../db/types'

type State =
  | { kind: 'running' }
  | { kind: 'analyzed'; song: Song; pending: number }
  | { kind: 'queued' }
  | { kind: 'error'; code: 'no_key' | 'bad_json' | 'other' }

const STEPS = ['Lettura del testo', 'Estrazione di chunk, grammatica, pronuncia', 'Selezione delle parole nella tua fascia']

export function Analyzing({ songId }: { songId: string }) {
  const { db, fetch, sleep, now } = useDeps()
  const [state, setState] = useState<State>({ kind: 'running' })
  const [title, setTitle] = useState('')
  const [attempt, setAttempt] = useState(0)
  const started = useRef<string | null>(null)

  useEffect(() => {
    const key = `${songId}:${attempt}`
    if (started.current === key) return
    started.current = key
    let alive = true
    setState({ kind: 'running' })
    void (async () => {
      try {
        const before = await db.songs.get(songId)
        if (alive && before) setTitle(before.title)
        if (before && (before.status === 'analyzed' || before.status === 'studying' || before.status === 'done')) {
          const pending = await db.words.where('songId').equals(songId).filter((w) => w.triage === 'pending').count()
          if (alive) setState({ kind: 'analyzed', song: before, pending })
          return
        }
        const ranks = await loadRanks(fetch)
        const outcome = await analyzeSong(db, songId, {
          fetch,
          sleep,
          now: now(),
          ranks,
          online: navigator.onLine,
        })
        if (!alive) return
        if (outcome === 'queued') {
          setState({ kind: 'queued' })
          return
        }
        const song = await db.songs.get(songId)
        const pending = await db.words.where('songId').equals(songId).filter((w) => w.triage === 'pending').count()
        if (alive && song) setState({ kind: 'analyzed', song, pending })
      } catch (e) {
        if (!alive) return
        const code = e instanceof GeminiError && (e.code === 'no_key' || e.code === 'bad_json') ? e.code : 'other'
        setState({ kind: 'error', code })
      }
    })()
    return () => {
      alive = false
      // Se il componente viene smontato prima dell'esito, un nuovo mount ripartirà da zero.
      if (started.current === key) started.current = null
    }
  }, [db, songId, attempt])

  const studyNow = async () => {
    if (state.kind !== 'analyzed') return
    await db.songs.update(songId, { status: 'studying' })
    window.location.hash = href({ name: state.pending > 0 ? 'triage' : 'study', songId })
  }

  return (
    <main class="screen analyzing">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'addSong' })} aria-label="Indietro">‹</a>
        <h1>{title || 'Analisi'}</h1>
      </header>

      <section class="card" aria-live="polite">
        {state.kind === 'running' && (
          <>
            <h2>Gemini sta leggendo il testo</h2>
            <ul class="steps">
              {STEPS.map((s) => (
                <li key={s}>
                  <span aria-hidden="true">○ </span>
                  {s}
                </li>
              ))}
            </ul>
          </>
        )}

        {state.kind === 'queued' && (
          <>
            <h2>In coda</h2>
            <p>La analizzo alla prossima apertura</p>
            <a class="btn outline" href={href({ name: 'songs' })}>Vai alle canzoni</a>
          </>
        )}

        {state.kind === 'analyzed' && (
          <>
            <h2>Analisi completata</h2>
            {state.song.difficultyKnownPct !== null && state.song.difficultyKnownPct < 60 && (
              <div class="outcome">
                <p><strong>Capiresti il {state.song.difficultyKnownPct}%</strong></p>
                <p>Puoi studiarla lo stesso o tenerla per più avanti.</p>
              </div>
            )}
            <button type="button" class="btn primary cta" onClick={studyNow}>Studiala ora</button>
            <a class="btn outline" href={href({ name: 'songs' })}>Tienila per più avanti</a>
          </>
        )}

        {state.kind === 'error' && (
          <div role="alert">
            {state.code === 'no_key' && (
              <>
                <h2>Manca la chiave Gemini</h2>
                <p>Aggiungila nelle impostazioni, poi riprova.</p>
                <a class="btn primary" href={href({ name: 'settings' })}>Vai a Impostazioni</a>
              </>
            )}
            {state.code === 'bad_json' && (
              <>
                <h2>Risposta non valida, riprova</h2>
                <button type="button" class="btn outline" onClick={() => setAttempt((n) => n + 1)}>Riprova</button>
              </>
            )}
            {state.code === 'other' && (
              <>
                <h2>Qualcosa è andato storto</h2>
                <p>Non sono riuscito a completare l'analisi. Riprova tra poco.</p>
                <button type="button" class="btn outline" onClick={() => setAttempt((n) => n + 1)}>Riprova</button>
              </>
            )}
            <a class="btn outline" href={href({ name: 'songs' })}>Lascia in coda</a>
          </div>
        )}
      </section>
    </main>
  )
}
