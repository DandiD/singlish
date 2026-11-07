import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { href, goBackTo, goReplace, onBack, onBackTo, stillHere } from '../../router'
import { deleteSong } from '../../domain/ingest'
import { finalListenDue, startStudying } from '../../domain/finalListen'
import { songPath } from '../../domain/path'
import { SongPath } from '../components/SongPath'
import { MoreMenu } from '../components/MoreMenu'
import { emptySelection, requestsOf, toggleJoin, toggleVerse, toggleWord, withinLimit, type Selection } from '../../domain/askSelection'
import { askGemini } from '../../domain/askDraft'
import { PickLine } from '../components/PickLine'
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
import { rCardStates, unlockedLines } from '../../domain/unlocked'
import { unlockedText } from '../todayText'

import { Icon } from '../components/Icon'
import { plural } from '../plural'
import { newId } from '../../domain/id'
import { ensureCover } from '../../domain/cover'
import { Cover } from '../components/Cover'
import { songLook } from '../cover'
import { LEGEND } from '../../domain/legend'


export function Study({ songId, itemId }: { songId: string; itemId?: string }) {
  const { db, now, fetch, sleep } = useDeps()
  const [sessionId, setSessionId] = useState('')
  const [confirming, setConfirming] = useState<false | 'done' | 'delete'>(false)
  const acting = useRef(false)
  // Chiedere a Gemini le parole segnate nel testo, tutte insieme.
  const [asking, setAsking] = useState(false)
  const [sel, setSel] = useState<Selection>(emptySelection)
  const [askBusy, setAskBusy] = useState(false)
  const [askMsg, setAskMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [limitMsg, setLimitMsg] = useState(false)
  const online = useOnline()
  const confirmRef = useRef<HTMLDivElement>(null)
  // Scelta dal menu «⋯»: il fuoco va su «Annulla» della conferma (che compare sotto la testata), mai sull'azione.
  useLayoutEffect(() => {
    if (confirming) confirmRef.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
  }, [confirming])
  const cancelConfirm = () => {
    setConfirming(false)
    document.querySelector<HTMLElement>('.study-head [aria-haspopup="menu"]')?.focus()
  }

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

  // La copertina di Spotify si cerca all'apertura, senza attendere: offline o bloccata, resta quella generata.
  useEffect(() => {
    void ensureCover(db, songId, fetch).catch(reportError)
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
    const rState = await rCardStates(db)
    return { song, chunks, words, pending, rState }
  }, [db, songId])

  // Versi sbloccati (stessa funzione di Oggi). Quelli accesi in questa vista restano accesi anche dopo la scrittura di `unlockedSeen`.
  const unlock = data?.song ? unlockedLines(data.song, data.chunks, data.words, data.rState) : null
  const unlockedNow = unlock ? unlock.lines.filter((l) => l.unlocked).map((l) => l.lineIndex) : null
  const litRef = useRef<{ songId: string; lines: number[] } | null>(null)
  const fresh = data?.song?.id === songId
  if (fresh && data?.song && unlockedNow && litRef.current?.songId !== songId) {
    // Senza `unlockedSeen` (canzone salvata prima di questa versione) i versi già sbloccati non sono una novità: nulla si accende.
    const before = new Set(data.song.unlockedSeen ?? [])
    litRef.current = { songId, lines: data.song.unlockedSeen === undefined ? [] : unlockedNow.filter((i) => !before.has(i)) }
  }
  // L'animazione si gioca una volta sola per visita: entrando in «Chiedi a Gemini» il set si svuota.
  if (asking && litRef.current) litRef.current.lines = []
  const seenKey = fresh && data?.song && unlockedNow && data.song.status !== 'draft' && data.song.status !== 'queued' ? unlockedNow.join(',') : null
  const storedKey = (data?.song?.unlockedSeen ?? []).join(',')
  useEffect(() => {
    if (seenKey === null || seenKey === storedKey) return
    db.songs.update(songId, { unlockedSeen: seenKey ? seenKey.split(',').map(Number) : [] }).catch(reportError)
  }, [db, songId, seenKey, storedKey])

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

  // Aperto dall'indirizzo su una canzone non ancora analizzata: niente studio (né «Segna come completata»).
  if (song.status === 'draft' || song.status === 'queued') {
    return (
      <main class="screen">
        <h1>{song.title}</h1>
        <p class="note">Questa canzone non è ancora stata analizzata: la trovi in Canzoni, dove puoi avviare l'analisi.</p>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }

  // Le voci di questa canzone: le stesse per l'evidenziazione nel testo e per i conteggi in testa (e per Oggi).
  const placed = itemsInSong(song, chunks, words)
  const hrefFor = (id: string) => href({ name: 'study', songId, itemId: id })
  // Una voce su più righe di questa canzone: la scheda deve mostrare la riga toccata, che va nell'indirizzo.
  const multiLine = new Set([...chunks, ...words].filter((x) => x.contexts.filter((c) => c.songId === songId).length > 1).map((x) => x.id))
  const hrefAt = (i: number) => (id: string) => (multiLine.has(id) ? href({ name: 'study', songId, itemId: `${id}@${i}` }) : hrefFor(id))

  const requests = requestsOf(song.lines, sel)
  const verseCount = requests.filter((r) => r.text === undefined).length
  const wordCount0 = requests.length - verseCount
  const barText = requests.length === 0
    ? 'Niente da chiedere'
    : [verseCount > 0 && plural(verseCount, 'verso', 'versi'), wordCount0 > 0 && plural(wordCount0, 'voce', 'voci')].filter(Boolean).join(' · ')
  // Un tocco che supererebbe il massimo lascia la selezione com'è e lo dice fino al tocco successivo.
  const change = (next: Selection) => {
    if (!withinLimit(song.lines, sel, next)) return setLimitMsg(true)
    setLimitMsg(false)
    setSel(next)
  }
  const ask = async () => {
    setAskBusy(true)
    setAskMsg(null)
    try {
      await askGemini(db, songId, requests, { fetch, sleep })
      setAsking(false)
      setSel(emptySelection())
      window.location.hash = href({ name: 'study', songId, itemId: 'ask' })
    } catch (e) {
      const model = await getSettings(db).then((x) => x.model, () => '')
      const p = geminiProblem(e, model)
      setAskMsg({ tone: 'error', text: `${p.title}. ${p.text}` })
    } finally {
      setAskBusy(false)
    }
  }

  const lineStates = new Map((unlock?.lines ?? []).map((l) => [l.lineIndex, l]))
  const chunkCount = placed.chunks.size
  const wordCount = placed.words.size
  const gp = song.grammarPoint
  const isText = song.kind === 'text'
  const stages = songPath({
    song, toTriage: pending, unlocked: unlock?.unlocked ?? 0, lines: unlock?.total ?? 0,
    finalReady: finalListenDue([song], now()).length > 0, now: now(),
  })
  const menuItems = [
    ...(song.status !== 'done' ? [{ text: isText ? 'Segna come completato' : 'Segna come completata', onSelect: () => setConfirming('done') }] : []),
    { text: isText ? 'Elimina testo' : 'Elimina canzone', onSelect: () => setConfirming('delete'), danger: true },
  ]

  return (
    <main class="screen study">
      <header class={`settings-head study-head song-hue-${songLook(song.id).hue}`}>
        <a class="icon-btn" href={href({ name: 'songs' })} onClick={onBack({ name: 'songs' })} aria-label="Indietro"><Icon name="back" /></a>
        <Cover song={song} size="lg" />
        <div class="grow">
          <h1>{song.title}</h1>
          {song.artist && <p class="study-artist">{song.artist}</p>}
          <p class="note">{`Studio · ${chunkCount} chunk · ${plural(wordCount, 'parola', 'parole')}${unlock && unlock.total > 0 ? ` · ${unlockedText(unlock.unlocked, unlock.total)}` : ''}`}</p>
          {!isText && song.spotifyUrl && (
            <a class="btn outline pill study-spotify" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
          )}
        </div>
        <div class="study-tools">
          {sessionId && (
            <TimerPill
              state={timer.state}
              remaining={timer.remaining}
              expired={timer.expired}
              onPause={timer.pause}
              onResume={timer.resume}
            />
          )}
          <MoreMenu label="Altre azioni" items={menuItems} />
        </div>
      </header>

      {/* Le conferme di completamento ed eliminazione (scelte dal menu «⋯»), subito sotto la testata. */}
      {confirming === 'done' ? (
        <div ref={confirmRef} class="confirm" role="alertdialog" aria-label="Conferma completamento">
          <p>{song.kind === 'text' ? 'Segnare questo testo come completato? Libera un posto tra le canzoni e i testi aperti.' : 'Segnare questa canzone come completata? Libera un posto tra le canzoni e i testi aperti.'}</p>
          <div class="grid2">
            <button type="button" class="btn outline" data-cancel onClick={cancelConfirm}>Annulla</button>
            <button
              type="button"
              class="btn primary"
              onClick={async () => {
                if (acting.current) return // doppio tocco: una volta sola
                acting.current = true
                const here = stillHere()
                try {
                  await db.songs.update(songId, { status: 'done' })
                  if (here()) goBackTo({ name: 'songs' })
                } catch (e) {
                  acting.current = false
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
        <div ref={confirmRef} class="confirm" role="alertdialog" aria-label="Conferma eliminazione">
          <p>{`Eliminare «${song.title}»? ${DELETE_NOTE}`}</p>
          <div class="grid2">
            <button
              type="button"
              class="btn outline danger"
              onClick={async () => {
                if (acting.current) return
                acting.current = true
                const here = stillHere()
                try {
                  await deleteSong(db, songId)
                  if (here()) goReplace({ name: 'songs' })
                } catch (e) {
                  acting.current = false
                  reportError(e)
                  setConfirming(false)
                }
              }}
            >
              Sì, elimina
            </button>
            <button type="button" class="btn outline" data-cancel onClick={cancelConfirm}>Annulla</button>
          </div>
        </div>
      ) : null}

      <SongPath stages={stages} songId={songId} kind={song.kind === 'text' ? 'text' : 'song'} />

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
        {LEGEND.filter(([cls]) => cls !== 'cs' || song.kind !== 'text').map(([cls, text]) => (
          <li key={cls}><span class={`swatch hl ${cls}`} aria-hidden="true" />{text}</li>
        ))}
      </ul>

      {!asking ? (
        askMsg && <p class={askMsg.tone === 'error' ? 'note danger' : 'note'} role="status">{askMsg.text}</p>
      ) : (
        <p class="note info-box">Tocca le parole che non ti sono chiare, o il numero di un verso per chiederlo tutto. Il simbolo ↔ unisce due parole vicine in un'espressione.</p>
      )}

      <div class={asking ? 'lyrics picking' : 'lyrics'} lang="en">
        {song.lines.map((l, i) => {
          const u = asking ? undefined : lineStates.get(i)
          const k = u?.unlocked ? (litRef.current?.lines.indexOf(i) ?? -1) : -1
          const cls = u ? (u.unlocked ? 'line-open' : 'line-studying') + (k >= 0 ? ' line-lit' : '') : undefined
          return (
          <p key={i} class={cls} style={k >= 0 ? { '--i': Math.min(k, 4) } : undefined}>
            {asking ? (
              <PickLine
                line={l} lineIndex={i} sel={sel} disabled={askBusy}
                onWord={(k) => change(toggleWord(sel, k))}
                onJoin={(k) => change(toggleJoin(sel, k))}
                onVerse={(n) => change(toggleVerse(sel, n))}
              />
            ) : (
              <Highlighted line={l} spans={placed.spansByLine[i]} hrefFor={hrefAt(i)} />
            )}
          </p>
          )
        })}
      </div>

      {asking && (
        <section class="ask-bar" role="region" aria-label="Da chiedere a Gemini">
          {askMsg?.tone === 'error' && <p class="note danger" role="alert">{askMsg.text}</p>}
          {limitMsg && <p class="note" role="status">Massimo 12 per volta</p>}
          {!online && <p class="note">Sei offline: per chiedere a Gemini serve la connessione.</p>}
          <div class="ask-row">
            <span class="note">{barText}</span>
            <button type="button" class="btn outline" disabled={askBusy} onClick={() => { setAsking(false); setSel(emptySelection()); setLimitMsg(false); setAskMsg(null) }}>Annulla</button>
            <button type="button" class="btn primary" disabled={requests.length === 0 || askBusy || !online} onClick={() => void ask()}>
              {askBusy ? 'Chiedo…' : 'Chiedi a Gemini'}
            </button>
          </div>
        </section>
      )}

      {placed.unshown.length > 0 && (
        <section class="other-items">
          <h2 class="section-label" id="other-items">{song.kind === 'text' ? 'ALTRE VOCI DI QUESTO TESTO' : 'ALTRE VOCI DI QUESTA CANZONE'}</h2>
          <ul aria-label={song.kind === 'text' ? 'Altre voci di questo testo' : 'Altre voci di questa canzone'}>
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

      {!asking && (
        <div class="study-ask">
          <button type="button" class="btn primary pill" onClick={() => { setAsking(true); setAskMsg(null); setLimitMsg(false) }}>Chiedi a Gemini</button>
        </div>
      )}

      {/* Una scheda nuova per ogni voce: lo stato di chiusura di quella prima non deve bloccare questa. */}
      {itemId && (itemId.startsWith('cs:') ? <SpeechSheet key={itemId} song={song} itemId={itemId} /> : <ItemSheet key={itemId} song={song} itemId={itemId} />)}
    </main>
  )
}
