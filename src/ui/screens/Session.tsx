import { useEffect, useRef, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { useFailure } from '../useFailure'
import { href, goBackTo, onBack, onBackTo, onReplace } from '../../router'
import { buildSessionQueue, type QueueItem } from '../../domain/queue'
import { recordReview } from '../../domain/scheduler'
import { pendingProductions, saveProduction } from '../../domain/production'
import { pendingWords } from '../../domain/triage'
import { useLive } from '../useLive'
import { getSettings } from '../../domain/settings'
import { elapsedMs, formatMmSs, isExpired, startTimer } from '../../domain/timer'
import { gradeAnswer, gradeDictation } from '../../domain/text'
import { useTimer } from '../useTimer'
import { TimerPill } from '../components/TimerPill'
import { Highlighted } from '../components/Highlighted'
import { CHUNK_CLASS, findForm, formIn } from '../../domain/songItems'
import { RatingBar, RATING_LABEL } from '../components/RatingBar'
import type { Chunk, ChunkType, Rating, Settings, Song, Word } from '../../db/types'
import { Icon } from '../components/Icon'
import { noAutocorrect } from '../noAutocorrect'
import { plural } from '../plural'
import { newId } from '../../domain/id'

const MAX_CARD_MS = 120_000
const EXTRA_MS = 5 * 60_000

const TYPE_CLASS: Record<ChunkType, string> = {
  phrasal_verb: 'pv', idiom: 'id', collocation: 'co', fixed_phrase: 'fp', slang: 'sl',
}

type Item = { kind: 'chunk'; item: Chunk } | { kind: 'word'; item: Word }

interface Loaded {
  settings: Settings
  sessionId: string
  items: QueueItem[]
  itemById: Map<string, Item>
  songById: Map<string, Song>
  doneReviews: number
  doneNew: number
  doneWritten: number
  /** Parole da smistare nelle canzoni in studio: le loro card nuove arrivano solo smistandole. */
  toTriage: boolean
}

const goToday = () => goBackTo({ name: 'today' })

export function Session() {
  const { db, now } = useDeps()
  const fail = useFailure()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [idx, setIdx] = useState(0)
  const [counts, setCounts] = useState({ reviews: 0, news: 0 })
  const [written, setWritten] = useState(0)
  // Card che tornano più tardi oggi (passi di apprendimento di FSRS): con queste la giornata non è finita.
  const [later, setLater] = useState<number | null>(null)
  // Le frasi da correggere sono tutte quelle in attesa, come in Oggi e in «Le tue frasi» (anche di una sessione ripresa).
  const toCorrect = useLive(() => pendingProductions(db), [db])?.length ?? 0
  const [sheet, setSheet] = useState(false)
  const busy = useRef(false)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const cardStart = useRef(0)
  const ended = useRef(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const settings = await getSettings(db)
      const n = now()
      const queue = await buildSessionQueue(db, n)
      const songs = await db.songs.toArray()
      const songById = new Map(songs.map((s) => [s.id, s]))

      // La coda esclude già ciò che la sessione aperta ha fatto vedere: è la stessa che conta Oggi.
      const open = queue.openSession
      // Una sessione aperta che non ha più nulla da mostrare si chiude: le card tornate in scadenza vanno in una nuova.
      if (queue.staleSession) await db.sessions.update(queue.staleSession.id, { endedAt: n })
      const chunkIds = queue.items.filter((q) => q.card.itemType === 'chunk').map((q) => q.card.itemId)
      const wordIds = queue.items.filter((q) => q.card.itemType === 'word').map((q) => q.card.itemId)
      const [chunks, words] = await Promise.all([db.chunks.bulkGet(chunkIds), db.words.bulkGet(wordIds)])
      const itemById = new Map<string, Item>()
      for (const c of chunks) if (c) itemById.set(c.id, { kind: 'chunk', item: c })
      for (const w of words) if (w) itemById.set(w.id, { kind: 'word', item: w })

      let sessionId = open?.id ?? ''
      if (queue.items.length === 0) {
        if (open) await db.sessions.update(open.id, { endedAt: n })
      } else if (!open) {
        sessionId = newId()
        await db.sessions.add({
          id: sessionId, kind: 'review', songId: null, startedAt: n, endedAt: null,
          timer: startTimer(settings.timerMinutes.review * 60_000, Date.now()),
          reviewsDone: 0, newDone: 0,
        })
      }
      if (!alive) return
      setCounts({ reviews: open?.reviewsDone ?? 0, news: open?.newDone ?? 0 })
      setLoaded({
        settings, sessionId: queue.items.length === 0 ? '' : sessionId, items: queue.items, itemById, songById,
        doneReviews: open?.reviewsDone ?? 0, doneNew: open?.newDone ?? 0,
        // le frasi della sessione contate come altrove (card presente, chunk attivo)
        doneWritten: open ? (await pendingProductions(db)).filter((p) => p.sessionId === open.id).length : 0,
        toTriage: queue.items.length === 0
          && (await Promise.all(songs.filter((s) => s.status === 'studying' || s.status === 'done').map((s) => pendingWords(db, s.id)))).some((l) => l.length > 0),
      })
    })().catch(fail)
    return () => { alive = false }
  }, [db])

  const sessionId = loaded?.sessionId ?? ''
  const timer = useTimer(sessionId, { autoPauseOnHide: true, wakeLock: true }, db)
  const timerRef = useRef(timer)
  timerRef.current = timer
  // Il timer è caricato quando lo stato non è più 'idle': prima non si danno comandi (race di useTimer).
  const timerReady = timer.state.status !== 'idle'

  useEffect(() => () => {
    if (timerRef.current.state.status === 'running') timerRef.current.pause()
  }, [])

  useEffect(() => {
    if (timerReady) cardStart.current = elapsedMs(timerRef.current.state, Date.now())
  }, [timerReady, idx])

  const items = loaded?.items ?? []
  const finished = loaded !== null && idx >= items.length

  useEffect(() => {
    if (!finished || !sessionId || ended.current) return
    if (!timerReady) return
    ended.current = true
    timerRef.current.stop()
    db.sessions.update(sessionId, { endedAt: now() })
      .then(() => buildSessionQueue(db, now()))
      .then((q) => setLater(q.items.length))
      .catch(reportError)
  }, [finished, sessionId, timerReady])

  // I dialoghi prendono il fuoco sull'azione principale quando si aprono.
  const pausedNow = timer.state.status === 'paused'
  useEffect(() => { if (pausedNow) resumeRef.current?.focus() }, [pausedNow])
  useEffect(() => { if (sheet) moreRef.current?.focus() }, [sheet])

  if (!loaded) return <main class="screen session" aria-busy="true" />

  // Anche le frasi già scritte nella sessione ripresa contano come card fatte: «N di M» non cala riprendendo.
  const total = loaded.doneReviews + loaded.doneNew + loaded.doneWritten + items.length
  const position = loaded.doneReviews + loaded.doneNew + loaded.doneWritten + idx

  const closeSession = async () => {
    timerRef.current.stop()
    try {
      await db.sessions.update(sessionId, { endedAt: now() })
    } catch (e) {
      reportError(e)
    }
    goToday()
  }

  const rate = async (rating: Rating, auto: boolean, answer: string | null) => {
    if (busy.current) return
    const current = items[idx]
    if (!current || !timerReady) return
    busy.current = true
    try {
      const elapsed = Math.min(MAX_CARD_MS, Math.max(0, elapsedMs(timerRef.current.state, Date.now()) - cardStart.current))
      const next = current.isNew
        ? { reviews: counts.reviews, news: counts.news + 1 }
        : { reviews: counts.reviews + 1, news: counts.news }
      // Voto e contatori della sessione in una sola transazione: o tutti e due, o nessuno.
      // Una card eliminata nel frattempo (da un'altra scheda) si salta: niente voto, niente conteggio.
      const recorded = await db.transaction('rw', db.cards, db.reviews, db.sessions, db.chunks, db.songs, async () => {
        if (!(await db.cards.get(current.card.id))) return false
        await recordReview(db, current.card.id, { rating, auto, answer, elapsedMs: elapsed }, now(), loaded.settings.desiredRetention)
        await db.sessions.update(sessionId, { reviewsDone: next.reviews, newDone: next.news })
        return true
      })
      if (recorded) setCounts(next)
      setIdx(idx + 1)
      if (idx + 1 < items.length && isExpired(timerRef.current.state, Date.now())) setSheet(true)
    } catch (e) {
      reportError(e)
    } finally {
      busy.current = false
    }
  }

  // Card Produci: la frase si salva per la correzione di fine sessione; il voto arriva dopo, con Gemini.
  const produce = async (sentence: string) => {
    if (busy.current) return
    const current = items[idx]
    if (!current || !timerReady) return
    busy.current = true
    try {
      const elapsed = Math.min(MAX_CARD_MS, Math.max(0, elapsedMs(timerRef.current.state, Date.now()) - cardStart.current))
      await saveProduction(db, sessionId, { cardId: current.card.id, itemId: current.card.itemId, sentence, elapsedMs: elapsed, wasNew: current.isNew, at: now() })
      setWritten((n) => n + 1)
      setIdx(idx + 1)
      if (idx + 1 < items.length && isExpired(timerRef.current.state, Date.now())) setSheet(true)
    } catch (e) {
      reportError(e)
    } finally {
      busy.current = false
    }
  }

  if (items.length > 0 && !finished && !timerReady) return <main class="screen session" aria-busy="true" />

  // Niente in coda e niente fatto: non è "Fatto per oggi", è che non c'è nulla da ripassare.
  // Le frasi da correggere di sessioni chiuse non sono «fatte oggi»: qui si offre di correggerle.
  if (items.length === 0 && counts.reviews + counts.news === 0 && written === 0 && loaded.doneWritten === 0) {
    const noSongs = loaded.songById.size === 0
    // Le card nuove di una canzone «Da studiare» entrano solo aprendone lo Studio: domani non cambierebbe nulla.
    const toStudy = [...loaded.songById.values()].some((s) => s.status === 'analyzed')
    const toAnalyze = [...loaded.songById.values()].some((s) => s.status === 'draft' || s.status === 'queued')
    return (
      <main class="screen session session-done">
        <h1>Niente da ripassare</h1>
        <p class="note">
          {noSongs
            ? 'Aggiungi una canzone: le sue espressioni e parole diventano le card del ripasso.'
            : toCorrect > 0
              ? 'Per ora non ci sono altre card da ripassare: le voci con una frase da correggere tornano nel ripasso dopo la correzione.'
              : loaded.toTriage
              ? 'Per ora non ci sono card in scadenza. Le card nuove delle parole possono arrivare quando smisti le parole nello Studio della canzone o del testo (entro il limite delle nuove del giorno).'
              : toStudy
              ? 'Per ora non ci sono card in scadenza. Aprendo lo Studio di una canzone o di un testo «Da studiare», le sue card nuove possono entrare nel ripasso.'
              : toAnalyze
                ? 'Per ora non ci sono card in scadenza. Hai canzoni o testi ancora da analizzare: in Canzoni tocca «Analizza ora».'
                : 'Per ora non ci sono card in scadenza. Torna domani.'}
        </p>
        {noSongs && (
          <a class="btn primary cta" href={href({ name: 'addSong' })}><Icon name="plus" size={18} />Aggiungi una canzone</a>
        )}
        {toCorrect > 0 && (
          <a class="btn primary cta" href={href({ name: 'feedback' })} onClick={onReplace({ name: 'feedback' })}>{toCorrect === 1 ? 'Correggi la frase con Gemini' : `Correggi le ${toCorrect} frasi con Gemini`}</a>
        )}
        <a class={noSongs || toCorrect > 0 ? 'btn outline' : 'btn primary cta'} href={href({ name: 'today' })} onClick={onBackTo({ name: 'today' })}>Torna a Oggi</a>
      </main>
    )
  }

  if (items.length === 0 || finished) {
    // Coda vuota già all'apertura: non torna nulla oggi. Altrimenti si aspetta il conteggio, per non dire «Fatto per oggi» a vuoto.
    const left = items.length === 0 ? 0 : later
    if (left === null) return <main class="screen session" aria-busy="true" />
    return (
      <main class="screen session session-done">
        <div class="done-mark" aria-hidden="true"><Icon name="check" size={44} /></div>
        {/* «Fatto per oggi» solo se oggi non resta nulla: né card in scadenza né frasi da correggere (confermate, possono tornare oggi). */}
        <h1>{left > 0 || toCorrect > 0 ? 'Sessione finita' : 'Fatto per oggi'}</h1>
        {/* Le frasi scritte contano come in «N di M»: diventano nuove o ripassate quando si confermano i voti. */}
        <p class="note">{`${plural(counts.reviews, 'ripassata', 'ripassate')} · ${plural(counts.news, 'nuova', 'nuove')}${loaded.doneWritten + written > 0 ? ` · ${plural(loaded.doneWritten + written, 'frase scritta', 'frasi scritte')}` : ''}`}</p>
        {left > 0 && <p class="note">{left === 1 ? '1 card ancora da fare oggi: la trovi in Oggi.' : `${left} card ancora da fare oggi: le trovi in Oggi.`}</p>}
        {toCorrect > 0 && <p class="note">Dopo la correzione le loro card possono tornare in scadenza già oggi.</p>}
        {toCorrect > 0 && (
          <a class="btn primary cta" href={href({ name: 'feedback' })} onClick={onReplace({ name: 'feedback' })}>{toCorrect === 1 ? 'Correggi la frase con Gemini' : `Correggi le ${toCorrect} frasi con Gemini`}</a>
        )}
        <a class="btn primary cta" href={href({ name: 'today' })} onClick={onBackTo({ name: 'today' })}>Torna a Oggi</a>
      </main>
    )
  }

  const current = items[idx]
  const found = loaded.itemById.get(current.card.itemId)
  const paused = timer.state.status === 'paused'
  const remainingCards = items.length - idx

  return (
    <main class="screen session">
      <header class="session-head">
        <a class="icon-btn" href={href({ name: 'today' })} onClick={onBack({ name: 'today' })} aria-label="Esci dalla sessione"><Icon name="close" /></a>
        <div class="grow">
          <span class="note">{`${position + 1} di ${total}`}</span>
          <div class="bar" aria-hidden="true"><div class="bar-fill" style={{ transform: `scaleX(${position / total})` }} /></div>
        </div>
        {timerReady && (
          <TimerPill
            state={timer.state}
            remaining={timer.remaining}
            expired={timer.expired}
            onPause={timer.pause}
            onResume={timer.resume}
          />
        )}
      </header>

      {found ? (
        <SessionCard
          key={current.card.id}
          card={current.card}
          isNew={current.isNew}
          found={found}
          song={loaded.songById.get(found.item.contexts[0]?.songId ?? found.item.songId)}
          onRate={rate}
          onProduce={produce}
        />
      ) : (
        <div class="card">
          <p class="note">Questa voce è stata eliminata.</p>
          <button type="button" class="btn primary cta" onClick={() => setIdx(idx + 1)}>Salta</button>
        </div>
      )}

      {paused && (
        <div class="overlay">
          <section class="overlay-box" role="dialog" aria-modal="true" aria-label="Sessione in pausa">
            <div class="mono pause-time">{formatMmSs(timer.remaining)}</div>
            <h2>In pausa</h2>
            <p class="intro center">{`Il tempo è fermo. ${remainingCards === 1 ? 'La card che resta ti aspetta' : `Le ${remainingCards} card che restano ti aspettano`}.`}</p>
            <button type="button" class="btn primary cta" ref={resumeRef} onClick={timer.resume}>Riprendi</button>
            <button type="button" class="btn outline" onClick={() => void closeSession()}>Ferma e salva</button>
          </section>
        </div>
      )}

      {sheet && (
        <div class="sheet-scrim">
          <section class="sheet" role="dialog" aria-modal="true" aria-label="Tempo della sessione finito">
            <div class="sheet-handle" aria-hidden="true" />
            <h1>{plural(Math.round(timer.state.durationMs / 60_000), 'minuto fatto', 'minuti fatti')}</h1>
            <div class="grid3">
              <div class="stat-box"><strong class="mono">{plural(counts.reviews, 'ripassata', 'ripassate')}</strong></div>
              <div class="stat-box"><strong class="mono">{plural(counts.news, 'nuova', 'nuove')}</strong></div>
              <div class="stat-box"><strong class="mono">{plural(remainingCards, 'resta', 'restano')}</strong></div>
            </div>
            {loaded.doneWritten + written > 0 && <p class="note">{`E ${plural(loaded.doneWritten + written, 'frase scritta', 'frasi scritte')} da correggere.`}</p>}
            <p class="intro">Chiudendo, quello che resta da fare oggi lo trovi su Oggi.</p>
            <button
              type="button"
              class="btn primary cta"
              ref={moreRef}
              onClick={() => { timerRef.current.extend(EXTRA_MS); setSheet(false) }}
            >
              Altri 5 minuti
            </button>
            <button type="button" class="btn outline" onClick={() => void closeSession()}>Chiudi</button>
          </section>
        </div>
      )}
    </main>
  )
}

function SessionCard({ card, isNew, found, song, onRate, onProduce }: {
  card: QueueItem['card']
  isNew: boolean
  found: Item
  song: Song | undefined
  onRate(rating: Rating, auto: boolean, answer: string | null): void
  onProduce(sentence: string): void
}) {
  if (card.kind === 'P' && found.kind === 'chunk') return <ProduceCard chunk={found.item} isNew={isNew} onRate={onRate} onProduce={onProduce} />
  if (card.kind === 'A' && found.kind === 'chunk') return <ListenCard chunk={found.item} song={song} isNew={isNew} onRate={onRate} />
  if (card.kind === 'S' && found.kind === 'word' && found.item.nuance) return <NuanceCard word={found.item} isNew={isNew} onRate={onRate} />
  const item = found.item
  const ctx = item.contexts[0] ?? { songId: item.songId, lineIndex: item.lineIndex }
  // Una voce aggiunta da Espandi non ha verso: la sua frase è l'esempio di Gemini.
  const fromExpand = item.origin === 'expand'
  const verse = fromExpand ? item.extraExampleEn : song?.lines[ctx.lineIndex] ?? ''
  // La stessa forma che lo Studio evidenzia: salvata per il verso, originale, base o irregolare.
  const surface = formIn(verse, [ctx.surfaceForm, item.surfaceForm, found.kind === 'chunk' ? found.item.baseForm : found.item.lemma])
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [proposed, setProposed] = useState<Rating | null>(null)
  const [selected, setSelected] = useState<Rating | null>(null)
  const isC = card.kind === 'C'
  const cls = found.kind === 'chunk' ? TYPE_CLASS[found.item.type] : 'w'

  const confirm = () => {
    if (proposed === null) return
    onRate(selected ?? proposed, (selected ?? proposed) === proposed, answer)
  }

  const check = () => {
    const g = gradeAnswer(answer, surface)
    setProposed(g.rating)
    setSelected(g.rating)
  }

  const at = findForm(verse, surface)
  const idxGap = at ? at.start : -1

  return (
    <section class="card session-card">
      <span class="chip">{`${isC ? 'COMPLETA' : 'RICONOSCI'}${isNew ? ' · NUOVA' : ''}`}</span>
      {!(isC && idxGap < 0) && (
        <p class="verse" lang="en">
          {isC ? (
            <>
              {verse.slice(0, idxGap)}
              <span class="gap" aria-label="spazio da completare">{'\u00a0'.repeat(10)}</span>
              {verse.slice(at ? at.end : 0)}
            </>
          ) : (
            <Highlighted line={verse} spans={[{ text: surface, id: item.id, className: `${cls} sweep` }]} />
          )}
        </p>
      )}
      <p class="note">{fromExpand ? 'Esempio' : `${song?.title ?? ''} · riga ${ctx.lineIndex + 1}`}</p>

      {!isC && !revealed && (
        <button type="button" class="btn primary cta" onClick={() => setRevealed(true)}>Mostra significato</button>
      )}

      {(isC || revealed) && (
        <div class="meaning">
          <div class="section-label">SIGNIFICATO</div>
          <p class="sheet-meaning">{item.meaningIt}</p>
          {!isC && item.explanationIt && <p class="sheet-expl">{item.explanationIt}</p>}
        </div>
      )}

      {!isC && revealed && <RatingBar onSelect={(r) => onRate(r, false, null)} />}

      {isC && (
        // Un modulo: "Invio" sulla tastiera del telefono fa Controlla, e poi Conferma.
        <form
          class="c-answer"
          onSubmit={(e) => {
            e.preventDefault()
            if (proposed === null) check()
            else confirm()
          }}
        >
          <label class="field">
            <span>La tua risposta</span>
            <input
              type="text"
              lang="en"
              autocomplete="off"
              autocapitalize="off"
              ref={noAutocorrect}
              enterKeyHint="go"
              placeholder={found.kind === 'chunk' ? 'scrivi il chunk' : 'scrivi la parola'}
              value={answer}
              readOnly={proposed !== null}
              onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
            />
          </label>
          {proposed === null ? (
            <button type="submit" class="btn primary cta">Controlla</button>
          ) : (
            <>
              <div class={`feedback f${proposed}`}>
                <strong>{proposed === 3 ? 'Esatto' : proposed === 2 ? 'Quasi: un errore di battitura' : 'Non ancora'}</strong>
                <p>{`Risposta attesa: ${surface} · voto proposto: ${RATING_LABEL[proposed]}`}</p>
              </div>
              <RatingBar selected={selected ?? proposed} onSelect={setSelected} />
              <button type="submit" class="btn primary cta">Conferma</button>
            </>
          )}
        </form>
      )}
    </section>
  )
}

/** Card Produci: una situazione in italiano e il chunk da usare; la frase si corregge a fine sessione. */
function ProduceCard({ chunk, isNew, onRate, onProduce }: {
  chunk: Chunk
  isNew: boolean
  onRate(rating: Rating, auto: boolean, answer: string | null): void
  onProduce(sentence: string): void
}) {
  const [sentence, setSentence] = useState('')
  const ok = sentence.trim().length > 0
  return (
    <section class="card session-card produce">
      <span class="chip">{`PRODUCI${isNew ? ' · NUOVA' : ''}`}</span>
      <div class="situation">
        <span class="section-label">SITUAZIONE</span>
        <p class="verse">{chunk.productionPromptIt}</p>
        <p class="use"><span class="note">Usa</span> <span class={`hl ${CHUNK_CLASS[chunk.type]}`} lang="en">{chunk.baseForm}</span></p>
      </div>
      <form class="c-answer" onSubmit={(e) => { e.preventDefault(); if (ok) onProduce(sentence.trim()) }}>
        <label class="field">
          <span>La tua frase in inglese</span>
          <textarea rows={3} lang="en" autocapitalize="off" ref={noAutocorrect} value={sentence}
            onInput={(e) => setSentence((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <p class="note info-box">La correggi con Gemini da «Le tue frasi» (anche a fine sessione), insieme alle altre: una sola chiamata.</p>
        <div class="grid2">
          <button type="button" class="btn outline" onClick={() => onRate(1, false, null)}>Non so farla</button>
          <button type="submit" class="btn primary" disabled={!ok}>Salva e avanti</button>
        </div>
      </form>
    </section>
  )
}

type Speech = { speechSynthesis?: { cancel(): void; speak(u: unknown): void } }
const speak = (text: string, rate: number) => {
  const synth = (window as unknown as Speech).speechSynthesis
  const Utter = (globalThis as unknown as { SpeechSynthesisUtterance?: new (t: string) => { rate: number; lang: string } }).SpeechSynthesisUtterance
  if (!synth || !Utter) return
  synth.cancel()
  const u = new Utter(text)
  u.lang = 'en-US'
  u.rate = rate
  synth.speak(u)
}

/** Card Ascolta: l'app legge il verso (sintesi vocale del dispositivo), si scrive quello che si sente. */
function ListenCard({ chunk, song, isNew, onRate }: {
  chunk: Chunk
  song: Song | undefined
  isNew: boolean
  onRate(rating: Rating, auto: boolean, answer: string | null): void
}) {
  // Canzone e riga dallo stesso verso: quello della canzone mostrata.
  const line = chunk.contexts.find((c) => c.songId === song?.id)?.lineIndex ?? chunk.lineIndex
  const verse = song?.lines[line] ?? chunk.extraExampleEn
  // La nota di pronuncia è pensata per una canzone: su un testo libero non si mostra.
  const notes = [song?.kind === 'text' ? '' : chunk.pronunciationNoteIt, ...(song?.connectedSpeech.filter((cs) => cs.lineIndex === line).map((cs) => cs.noteIt) ?? [])].filter((n) => n.trim())
  const canSpeak = !!(window as unknown as Speech).speechSynthesis
  const [slow, setSlow] = useState(false)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<{ rating: Rating; wrongWords: number } | null>(null)
  const [selected, setSelected] = useState<Rating | null>(null)
  const check = () => { const g = gradeDictation(answer, verse); setResult(g); setSelected(g.rating) }
  const verdict = result === null ? '' : result.wrongWords === 0 ? 'Esatto' : result.wrongWords === 1 ? 'Quasi: una parola' : 'Non ancora'
  return (
    <section class="card session-card listen">
      <span class="chip">{`ASCOLTA${isNew ? ' · NUOVA' : ''}`}</span>
      <div class="listen-player">
        {canSpeak ? (
          <>
            <button type="button" class="play-btn" aria-label="Riproduci la frase" onClick={() => speak(verse, slow ? 0.7 : 1)}><Icon name="play" size={36} /></button>
            <div class="chips-row" role="group" aria-label="Velocità">
              <button type="button" class="filter-chip" aria-pressed={!slow} onClick={() => setSlow(false)}>Velocità naturale</button>
              <button type="button" class="filter-chip" aria-pressed={slow} onClick={() => setSlow(true)}>Più lenta</button>
            </div>
            <p class="note center">Scrivi quello che senti. Fai attenzione a come si fondono le parole.</p>
          </>
        ) : (
          <>
            <p class="note center">{song?.kind === 'text' ? 'Questo browser non sa leggere ad alta voce: leggi il verso, poi scrivilo.' : 'Questo browser non sa leggere ad alta voce: ascolta il verso nella canzone, poi scrivilo.'}</p>
            <p class="verse" lang="en">{verse}</p>
          </>
        )}
      </div>
      <form class="c-answer" onSubmit={(e) => { e.preventDefault(); if (result === null) check(); else onRate(selected ?? result.rating, (selected ?? result.rating) === result.rating, answer) }}>
        <label class="field">
          <span>Dettato</span>
          <input type="text" lang="en" autocomplete="off" autocapitalize="off" ref={noAutocorrect} enterKeyHint="go" value={answer}
            readOnly={result !== null} onInput={(e) => setAnswer((e.currentTarget as HTMLInputElement).value)} />
        </label>
        {result === null ? (
          <button type="submit" class="btn primary cta" disabled={!answer.trim()}>Controlla</button>
        ) : (
          <>
            <div class={`feedback f${result.rating}`}>
              <strong>{verdict}</strong>
              {canSpeak && <p lang="en">{verse}</p>}
              {notes.map((n, i) => <p key={i}>{n}</p>)}
            </div>
            <RatingBar selected={selected ?? result.rating} onSelect={setSelected} />
            <button type="submit" class="btn primary cta">Conferma</button>
          </>
        )}
      </form>
    </section>
  )
}

/** Card Sfumature: una situazione, una frase con il buco, la parola giusta fra quelle vicine. */
function NuanceCard({ word, isNew, onRate }: { word: Word; isNew: boolean; onRate(rating: Rating, auto: boolean, answer: string | null): void }) {
  const n = word.nuance!
  const [choice, setChoice] = useState<string | null>(null)
  const right = choice === n.answer
  return (
    <section class="card session-card nuance">
      <span class="chip">{`SFUMATURE${isNew ? ' · NUOVA' : ''}`}</span>
      <div class="situation">
        <span class="section-label">SITUAZIONE</span>
        <p>{n.situation_it}</p>
        <p class="verse" lang="en">{n.sentence_en}</p>
      </div>
      <div class="nuance-options" role="group" aria-label="Scegli la parola">
        {n.options.map((o) => (
          <button key={o} type="button" lang="en" disabled={choice !== null}
            class={choice === null ? 'nuance-opt' : o === n.answer ? 'nuance-opt right' : o === choice ? 'nuance-opt wrong' : 'nuance-opt'}
            aria-pressed={choice === o} onClick={() => setChoice(o)}>{o}</button>
        ))}
      </div>
      {choice !== null && (
        <>
          <div class={`feedback ${right ? 'f3' : 'f1'}`}>
            <strong>{right ? `Giusto: ${n.answer}` : `Non è ${choice}: è ${n.answer}`}</strong>
            <p>{n.explanation_it}</p>
          </div>
          <RatingBar selected={right ? 3 : 1} onSelect={(r) => onRate(r, r === (right ? 3 : 1), choice)} />
        </>
      )}
    </section>
  )
}
