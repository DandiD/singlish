import { useEffect, useRef, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { href } from '../../router'
import { buildSessionQueue, startOfLocalDay, type QueueItem } from '../../domain/queue'
import { recordReview } from '../../domain/scheduler'
import { getSettings } from '../../domain/settings'
import { elapsedMs, formatMmSs, isExpired, startTimer } from '../../domain/timer'
import { gradeAnswer } from '../../domain/text'
import { useTimer } from '../useTimer'
import { TimerPill } from '../components/TimerPill'
import { Highlighted } from '../components/Highlighted'
import { RatingBar, RATING_LABEL } from '../components/RatingBar'
import type { Chunk, ChunkType, Rating, Settings, Song, Word } from '../../db/types'

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
}

const goToday = () => {
  window.location.hash = href({ name: 'today' })
}

export function Session() {
  const { db, now } = useDeps()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [idx, setIdx] = useState(0)
  const [counts, setCounts] = useState({ reviews: 0, news: 0 })
  const [sheet, setSheet] = useState(false)
  const busy = useRef(false)
  const cardStart = useRef(0)
  const ended = useRef(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const settings = await getSettings(db)
      const n = now()
      const queue = await buildSessionQueue(db, n)
      const chunkIds = queue.items.filter((q) => q.card.itemType === 'chunk').map((q) => q.card.itemId)
      const wordIds = queue.items.filter((q) => q.card.itemType === 'word').map((q) => q.card.itemId)
      const [chunks, words] = await Promise.all([db.chunks.bulkGet(chunkIds), db.words.bulkGet(wordIds)])
      const itemById = new Map<string, Item>()
      for (const c of chunks) if (c) itemById.set(c.id, { kind: 'chunk', item: c })
      for (const w of words) if (w) itemById.set(w.id, { kind: 'word', item: w })
      const songs = await db.songs.toArray()
      const songById = new Map(songs.map((s) => [s.id, s]))

      const dayStart = startOfLocalDay(n)
      const open = (await db.sessions.where('startedAt').aboveOrEqual(dayStart).toArray())
        .filter((r) => r.kind === 'review' && r.endedAt === null)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]

      let sessionId = open?.id ?? ''
      if (queue.items.length === 0) {
        if (open) await db.sessions.update(open.id, { endedAt: n })
      } else if (!open) {
        sessionId = crypto.randomUUID()
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
      })
    })()
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
    void db.sessions.update(sessionId, { endedAt: now() })
  }, [finished, sessionId, timerReady])

  if (!loaded) return <main class="screen session" aria-busy="true" />

  const total = loaded.doneReviews + loaded.doneNew + items.length
  const position = loaded.doneReviews + loaded.doneNew + idx

  const closeSession = async () => {
    timerRef.current.stop()
    await db.sessions.update(sessionId, { endedAt: now() })
    goToday()
  }

  const rate = async (rating: Rating, auto: boolean, answer: string | null) => {
    if (busy.current) return
    const current = items[idx]
    if (!current || !timerReady) return
    busy.current = true
    try {
      const elapsed = Math.min(MAX_CARD_MS, Math.max(0, elapsedMs(timerRef.current.state, Date.now()) - cardStart.current))
      await recordReview(db, current.card.id, { rating, auto, answer, elapsedMs: elapsed }, now(), loaded.settings.desiredRetention)
      const next = current.isNew
        ? { reviews: counts.reviews, news: counts.news + 1 }
        : { reviews: counts.reviews + 1, news: counts.news }
      await db.sessions.update(sessionId, { reviewsDone: next.reviews, newDone: next.news })
      setCounts(next)
      setIdx(idx + 1)
      if (idx + 1 < items.length && isExpired(timerRef.current.state, Date.now())) setSheet(true)
    } finally {
      busy.current = false
    }
  }

  if (items.length > 0 && !finished && !timerReady) return <main class="screen session" aria-busy="true" />

  if (items.length === 0 || finished) {
    return (
      <main class="screen session session-done">
        <h1>Fatto per oggi</h1>
        <p class="note">{`${counts.reviews} ripassate · ${counts.news} nuove`}</p>
        <a class="btn primary cta" href={href({ name: 'today' })}>Torna a Oggi</a>
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
        <a class="icon-btn" href={href({ name: 'today' })} aria-label="Esci dalla sessione">×</a>
        <div class="grow">
          <span class="note">{`${position + 1} di ${total}`}</span>
          <div class="bar" aria-hidden="true"><div class="bar-fill" style={{ width: `${(position / total) * 100}%` }} /></div>
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
        />
      ) : (
        <p class="note">Elemento non trovato.</p>
      )}

      {paused && (
        <div class="overlay">
          <section class="overlay-box" role="dialog" aria-modal="true" aria-label="Sessione in pausa">
            <div class="mono pause-time">{formatMmSs(timer.remaining)}</div>
            <h2>In pausa</h2>
            <p class="intro center">{`Il tempo è fermo. ${remainingCards === 1 ? 'La card che resta ti aspetta' : `Le ${remainingCards} card che restano ti aspettano`}.`}</p>
            <button type="button" class="btn primary cta" onClick={timer.resume}>Riprendi</button>
            <button type="button" class="btn outline" onClick={() => void closeSession()}>Ferma e salva</button>
          </section>
        </div>
      )}

      {sheet && (
        <div class="sheet-scrim">
          <section class="sheet" role="dialog" aria-modal="true" aria-label="Tempo della sessione finito">
            <div class="sheet-handle" aria-hidden="true" />
            <h1>{`${Math.round(timer.state.durationMs / 60_000)} minuti fatti`}</h1>
            <div class="grid3">
              <div class="stat-box"><strong class="mono">{`${counts.reviews} ripassate`}</strong></div>
              <div class="stat-box"><strong class="mono">{`${counts.news} nuove`}</strong></div>
              <div class="stat-box"><strong class="mono">{`${remainingCards} restano`}</strong></div>
            </div>
            <p class="intro">Le card che restano scadono domani: il ripasso tiene conto del ritardo.</p>
            <button
              type="button"
              class="btn primary cta"
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

function SessionCard({ card, isNew, found, song, onRate }: {
  card: QueueItem['card']
  isNew: boolean
  found: Item
  song: Song | undefined
  onRate(rating: Rating, auto: boolean, answer: string | null): void
}) {
  const item = found.item
  const ctx = item.contexts[0] ?? { songId: item.songId, lineIndex: item.lineIndex }
  const verse = song?.lines[ctx.lineIndex] ?? ''
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [proposed, setProposed] = useState<Rating | null>(null)
  const [selected, setSelected] = useState<Rating | null>(null)
  const isC = card.kind === 'C'
  const cls = found.kind === 'chunk' ? TYPE_CLASS[found.item.type] : 'w'

  const check = () => {
    const g = gradeAnswer(answer, item.surfaceForm)
    setProposed(g.rating)
    setSelected(g.rating)
  }

  const idxGap = verse.toLowerCase().replace(/[’‘]/g, "'").indexOf(item.surfaceForm.toLowerCase().replace(/[’‘]/g, "'"))

  return (
    <section class="card session-card">
      <span class="chip">{`${isC ? 'COMPLETA' : 'RICONOSCI'}${isNew ? ' · NUOVA' : ''}`}</span>
      <p class="verse" lang="en">
        {isC ? (
          idxGap >= 0 ? (
            <>
              {verse.slice(0, idxGap)}
              <span class="gap" aria-label="spazio da completare">{' '.repeat(10)}</span>
              {verse.slice(idxGap + item.surfaceForm.length)}
            </>
          ) : (
            <>{verse} <span class="gap" aria-label="spazio da completare">{' '.repeat(10)}</span></>
          )
        ) : (
          <Highlighted line={verse} spans={[{ text: item.surfaceForm, id: item.id, className: cls }]} />
        )}
      </p>
      <p class="note">{`${song?.title ?? ''} · riga ${ctx.lineIndex + 1}`}</p>

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
        <div class="c-answer">
          <label class="field">
            <span>La tua risposta</span>
            <input
              type="text"
              lang="en"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck={'false' as unknown as boolean}
              placeholder="scrivi il chunk"
              value={answer}
              readOnly={proposed !== null}
              onInput={(e) => setAnswer((e.target as HTMLInputElement).value)}
            />
          </label>
          {proposed === null ? (
            <button type="button" class="btn primary cta" onClick={check}>Controlla</button>
          ) : (
            <>
              <div class={`feedback f${proposed}`}>
                <strong>{proposed === 3 ? 'Esatto' : proposed === 2 ? 'Quasi: un errore di battitura' : 'Non ancora'}</strong>
                <p>{`Risposta attesa: ${item.surfaceForm} · voto proposto: ${RATING_LABEL[proposed]}`}</p>
              </div>
              <RatingBar selected={selected ?? proposed} onSelect={setSelected} />
              <button
                type="button"
                class="btn primary cta"
                onClick={() => onRate(selected ?? proposed, (selected ?? proposed) === proposed, answer)}
              >
                Conferma
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
