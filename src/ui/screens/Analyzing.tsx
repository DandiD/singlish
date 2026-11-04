import { useEffect, useRef, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { href, goReplace, onBack, onBackTo } from '../../router'
import { analyzeSong } from '../../domain/ingest'
import { startStudying } from '../../domain/finalListen'
import { loadRanks } from '../../domain/freq'
import { pendingWords } from '../../domain/triage'
import { getSettings } from '../../domain/settings'
import { geminiProblem, type Problem } from '../errors'
import type { Song } from '../../db/types'
import { Icon } from '../components/Icon'

type State =
  | { kind: 'running' }
  | { kind: 'analyzed'; song: Song; pending: number }
  | { kind: 'queued'; reason: 'offline' | 'busy' }
  | { kind: 'missing' }
  | { kind: 'error'; problem: Problem }

const STEPS = ['Lettura del testo', 'Estrazione di chunk, grammatica, pronuncia', 'Selezione delle parole nella tua fascia']
// Un testo libero non ha pronuncia del canto.
const TEXT_STEPS = ['Lettura del testo', 'Estrazione di chunk e grammatica', 'Selezione delle parole nella tua fascia']

export function Analyzing({ songId }: { songId: string }) {
  const { db, fetch, sleep, now } = useDeps()
  const [state, setState] = useState<State>({ kind: 'running' })
  const [title, setTitle] = useState('')
  const [isText, setIsText] = useState(false)
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
        if (!before) {
          if (alive) setState({ kind: 'missing' })
          return
        }
        if (alive) { setTitle(before.title); setIsText(before.kind === 'text') }
        if (before && (before.status === 'analyzed' || before.status === 'studying' || before.status === 'done')) {
          const pending = (await pendingWords(db, songId)).length
          if (alive) setState({ kind: 'analyzed', song: before, pending })
          return
        }
        let ranks = new Map<string, number>()
        let online = navigator.onLine
        if (online) {
          try {
            ranks = await loadRanks(fetch)
          } catch {
            online = false // senza frequenze non si può analizzare: la canzone va in coda
          }
        }
        const outcome = await analyzeSong(db, songId, {
          fetch,
          sleep,
          now: now(),
          ranks,
          online,
        })
        if (!alive) return
        if (outcome === 'queued') {
          setState({ kind: 'queued', reason: online ? 'busy' : 'offline' })
          return
        }
        const song = await db.songs.get(songId)
        const pending = (await pendingWords(db, songId)).length
        if (alive && song) setState({ kind: 'analyzed', song, pending })
      } catch (e) {
        if (!alive) return
        const model = await getSettings(db).then((s) => s.model, () => '')
        if (alive) setState({ kind: 'error', problem: geminiProblem(e, model) })
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
    try {
      await startStudying(db, songId, now())
    } catch (e) {
      reportError(e)
      return
    }
    goReplace({ name: state.pending > 0 ? 'triage' : 'study', songId })
  }

  return (
    <main class="screen analyzing">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBack({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
        <h1>{title || 'Analisi'}</h1>
      </header>

      <section class="card" aria-live="polite">
        {state.kind === 'running' && (
          <>
            <div class="wave" aria-hidden="true"><span /><span /><span /><span /><span /></div>
            <h2>Gemini sta leggendo il testo</h2>
            <ul class="steps">
              {(isText ? TEXT_STEPS : STEPS).map((s, i) => (
                <li key={s} style={{ '--i': i }}>
                  <span class="step-dot" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </>
        )}

        {state.kind === 'queued' && state.reason === 'offline' && (
          <>
            <h2>Sei offline</h2>
            <p>{isText ? 'Il testo è salvato. Lo analizzo quando riapri l\'app con la connessione.' : 'La canzone è salvata. La analizzo quando riapri l\'app con la connessione.'}</p>
            <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Vai alle canzoni</a>
          </>
        )}

        {state.kind === 'queued' && state.reason === 'busy' && (
          <>
            <h2>Gemini è occupato</h2>
            <p>
              Hai raggiunto il limite di richieste gratuite, o il servizio non risponde. {isText ? 'Il testo è salvato e resta in coda: lo analizzo alla prossima apertura dell\'app.' : 'La canzone è salvata e resta in coda: la analizzo alla prossima apertura dell\'app.'}
            </p>
            <button type="button" class="btn primary" onClick={() => setAttempt((n) => n + 1)}>Riprova ora</button>
            <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Vai alle canzoni</a>
          </>
        )}

        {state.kind === 'missing' && (
          <>
            <h2>Canzone non trovata</h2>
            <p>Forse è stata eliminata, o il link è sbagliato.</p>
            <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Vai alle canzoni</a>
          </>
        )}

        {state.kind === 'analyzed' && (
          <>
            <h2>Analisi completata</h2>
            {state.song.difficultyKnownPct !== null && state.song.difficultyKnownPct < 60 && (
              <div class="outcome">
                <p>
                  {`Capiresti il ${state.song.difficultyKnownPct}%: ${state.song.kind === 'text' ? 'puoi studiarlo lo stesso o tenerlo per più avanti' : 'puoi studiarla lo stesso o tenerla per più avanti'}`}
                </p>
              </div>
            )}
            {state.song.status !== 'done' && (
              <button type="button" class="btn primary cta" onClick={studyNow}>{state.song.kind === 'text' ? 'Studialo ora' : 'Studiala ora'}</button>
            )}
            <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>{state.song.kind === 'text' ? 'Tienilo per più avanti' : 'Tienila per più avanti'}</a>
          </>
        )}

        {state.kind === 'error' && (
          <div role="alert">
            <h2>{state.problem.title}</h2>
            <p>{state.problem.text}</p>
            {state.problem.fix === 'settings' && (
              <a class="btn primary" href={href({ name: 'settings' })}>Vai a Impostazioni</a>
            )}
            {state.problem.fix === 'retry' && (
              <button type="button" class="btn primary" onClick={() => setAttempt((n) => n + 1)}>Riprova</button>
            )}
            <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
          </div>
        )}
      </section>
    </main>
  )
}
