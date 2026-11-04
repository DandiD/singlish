import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { href, goBackTo, goReplace, onBack, onBackTo } from '../../router'
import { deleteSong } from '../../domain/ingest'
import { startStudying } from '../../domain/finalListen'
import { askGemini, groupSelection, tokenize } from '../../domain/ask'
import { chorusLines } from '../../domain/chorus'
import { geminiProblem } from '../errors'
import { useOnline } from '../components/OfflineBadge'
import { DELETE_NOTE } from './Songs'
import { getSettings } from '../../domain/settings'
import { pendingWords } from '../../domain/triage'
import { startTimer } from '../../domain/timer'
import { useTimer } from '../useTimer'
import { TimerPill } from '../components/TimerPill'
import { Highlighted } from '../components/Highlighted'
import { CHUNK_CLASS, itemsInSong } from '../../domain/songItems'
import { ItemSheet, SpeechSheet } from './ItemSheet'

import { Icon } from '../components/Icon'
import { plural } from '../plural'
import { newId } from '../../domain/id'

const LEGEND: [string, string][] = [
  ['pv', 'phrasal verb'], ['id', 'idioma'], ['co', 'collocazione'], ['fp', 'espressione fissa'], ['sl', 'slang'], ['w', 'parola'], ['cs', 'pronuncia'],
]

export function Study({ songId, itemId }: { songId: string; itemId?: string }) {
  const { db, now, fetch, sleep } = useDeps()
  const [sessionId, setSessionId] = useState('')
  const [confirming, setConfirming] = useState<false | 'done' | 'delete'>(false)
  // Chiedere a Gemini le parole segnate nel testo, tutte insieme.
  const [asking, setAsking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [askBusy, setAskBusy] = useState(false)
  const [askMsg, setAskMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const online = useOnline()

  useEffect(() => {
    let alive = true
    const id = newId()
    const created = (async () => {
      const s = await getSettings(db)
      if (!alive) return false // uscito prima: nessuna sessione
      const t = Date.now()
      await db.sessions.add({
        id, kind: 'study', songId, startedAt: now(), endedAt: null,
        timer: startTimer(s.timerMinutes.study * 60_000, t), reviewsDone: 0, newDone: 0,
      })
      if (alive) setSessionId(id)
      return true
    })()
    created.catch(reportError)
    return () => {
      alive = false
      // Uscendo dallo Studio la sua sessione si chiude.
      void created.then(async (made) => { if (made) await db.sessions.update(id, { endedAt: now() }) }).catch(reportError)
    }
  }, [db, songId])

  // Aprire lo Studio di una canzone tenuta per più avanti la mette in studio: da qui le sue card nuove entrano nel ripasso.
  useEffect(() => {
    startStudying(db, songId, now()).catch(reportError)
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
  const hrefFor = (id: string) => href({ name: 'study', songId, itemId: id })

  const picks = groupSelection(song.lines, picked)
  const toggle = (key: string) => setPicked((cur) => {
    const next = new Set(cur)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const ask = async () => {
    setAskBusy(true)
    setAskMsg(null)
    try {
      const r = await askGemini(db, songId, picks, { fetch, sleep, now: now() })
      const parts = [
        r.added > 0 ? `${plural(r.added, 'voce aggiunta', 'voci aggiunte')} al ripasso` : '',
        r.existing > 0 ? `${plural(r.existing, "c'era già", "c'erano già")}` : '',
      ].filter(Boolean)
      setAskMsg({ tone: 'ok', text: parts.length ? `${parts.join('; ')}.` : 'Gemini non ha trovato nulla da aggiungere.' })
      setAsking(false)
      setPicked(new Set())
    } catch (e) {
      const model = await getSettings(db).then((x) => x.model, () => '')
      const p = geminiProblem(e, model)
      setAskMsg({ tone: 'error', text: `${p.title}. ${p.text}` })
    } finally {
      setAskBusy(false)
    }
  }

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

      {!asking ? (
        <div class="ask-start">
          <div class="row-actions">
            <button type="button" class="btn outline" onClick={() => { setAsking(true); setAskMsg(null) }}>Chiedi a Gemini</button>
            {song.kind !== 'text' && chorusLines(song.lines).length > 0 && (
              <a class="btn outline" href={href({ name: 'chorus', songId })}>Ritornello a voce</a>
            )}
          </div>
          {askMsg && <p class={askMsg.tone === 'error' ? 'note danger' : 'note'} role="status">{askMsg.text}</p>}
        </div>
      ) : (
        <p class="note info-box">Leggi tutto il testo e tocca ogni parola o espressione che non ti è chiara: le chiedi tutte insieme, con una sola chiamata. Parole vicine diventano un'espressione.</p>
      )}

      <div class={asking ? 'lyrics picking' : 'lyrics'} lang="en">
        {song.lines.map((l, i) => (
          <p key={i}>
            {asking ? (
              <PickLine line={l} lineIndex={i} picked={picked} onToggle={toggle} />
            ) : (
              <Highlighted line={l} spans={placed.spansByLine[i]} hrefFor={hrefFor} />
            )}
          </p>
        ))}
      </div>

      {asking && (
        <section class="ask-bar" role="region" aria-label="Da chiedere a Gemini">
          {askMsg?.tone === 'error' && <p class="note danger" role="alert">{askMsg.text}</p>}
          {!online && <p class="note">Sei offline: per chiedere a Gemini serve la connessione.</p>}
          <div class="ask-row">
            <span class="note">{`${picks.length} da chiedere`}</span>
            <button type="button" class="btn outline" onClick={() => { setAsking(false); setPicked(new Set()); setAskMsg(null) }}>Annulla</button>
            <button type="button" class="btn primary" disabled={picks.length === 0 || askBusy || !online} onClick={() => void ask()}>
              {askBusy ? 'Chiedo…' : 'Chiedi a Gemini'}
            </button>
          </div>
        </section>
      )}

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
        {confirming === 'done' ? (
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
        ) : confirming === 'delete' ? (
          <div class="confirm" role="alertdialog" aria-label="Conferma eliminazione">
            <p>{`Eliminare «${song.title}»? ${DELETE_NOTE}`}</p>
            <div class="grid2">
              <button
                type="button"
                class="btn outline danger"
                onClick={async () => {
                  try {
                    await deleteSong(db, songId)
                    goReplace({ name: 'songs' })
                  } catch (e) {
                    reportError(e)
                    setConfirming(false)
                  }
                }}
              >
                Sì, elimina
              </button>
              <button type="button" class="btn outline" onClick={() => setConfirming(false)}>Annulla</button>
            </div>
          </div>
        ) : (
          <div class="grid2">
            <button type="button" class="btn outline" onClick={() => setConfirming('done')}>Segna come completata</button>
            <button type="button" class="btn outline danger" onClick={() => setConfirming('delete')}>Elimina canzone</button>
          </div>
        )}
      </footer>

      {itemId && (itemId.startsWith('cs:') ? <SpeechSheet song={song} itemId={itemId} /> : <ItemSheet song={song} itemId={itemId} />)}
    </main>
  )
}

/** Un verso in modalità selezione: ogni parola è un pulsante che si segna e si toglie. */
function PickLine({ line, lineIndex, picked, onToggle }: { line: string; lineIndex: number; picked: Set<string>; onToggle(key: string): void }) {
  const out: preact.ComponentChildren[] = []
  let pos = 0
  tokenize(line).forEach((t, ti) => {
    if (t.start > pos) out.push(line.slice(pos, t.start))
    const key = `${lineIndex}:${ti}`
    out.push(
      <button key={key} type="button" class="tok" aria-pressed={picked.has(key)} onClick={() => onToggle(key)}>{t.text}</button>,
    )
    pos = t.end
  })
  if (pos < line.length) out.push(line.slice(pos))
  return <>{out}</>
}
