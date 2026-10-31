import { useEffect, useRef, useState } from 'preact/hooks'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDeps } from '../deps'
import { href } from '../../router'
import { getSettings } from '../../domain/settings'
import { startTimer } from '../../domain/timer'
import { useTimer } from '../useTimer'
import { TimerPill } from '../components/TimerPill'
import { Highlighted, type Span } from '../components/Highlighted'
import { ItemSheet } from './ItemSheet'
import type { ChunkType } from '../../db/types'

const TYPE_CLASS: Record<ChunkType, string> = {
  phrasal_verb: 'pv',
  idiom: 'id',
  collocation: 'co',
  fixed_phrase: 'fp',
  slang: 'sl',
}

const LEGEND: [string, string][] = [
  ['pv', 'phrasal verb'], ['id', 'idioma'], ['co', 'collocazione'], ['sl', 'slang'], ['w', 'parola'], ['cs', 'pronuncia'],
]

export function Study({ songId, itemId }: { songId: string; itemId?: string }) {
  const { db, now } = useDeps()
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    let alive = true
    const id = crypto.randomUUID()
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

  const timer = useTimer(sessionId, { autoPauseOnHide: true, wakeLock: false }, db)
  const timerRef = useRef(timer)
  timerRef.current = timer
  useEffect(() => () => { timerRef.current.pause() }, [])

  const data = useLiveQuery(async () => {
    const song = (await db.songs.get(songId)) ?? null
    const chunks = (await db.chunks.toArray()).filter((c) => c.contexts.some((x) => x.songId === songId))
    const words = (await db.words.toArray()).filter((w) => w.contexts.some((x) => x.songId === songId) || w.songId === songId)
    return { song, chunks, words }
  }, [db, songId])

  if (!data) return <main class="screen" />
  const { song, chunks, words } = data
  if (!song) {
    return (
      <main class="screen">
        <p>Canzone non trovata.</p>
        <a class="btn outline" href={href({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }

  const pending = words.filter((w) => w.songId === songId && w.triage === 'pending').length

  const spansFor = (i: number): Span[] => {
    const spans: Span[] = []
    for (const c of chunks) {
      if (c.suspended) continue
      if (c.contexts.some((x) => x.songId === songId && x.lineIndex === i)) {
        spans.push({ text: c.surfaceForm, id: c.id, className: TYPE_CLASS[c.type] })
      }
    }
    for (const w of words) {
      if (w.suspended || w.triage === 'known') continue
      const ctxs = w.contexts.some((x) => x.songId === songId) ? w.contexts.filter((x) => x.songId === songId) : [{ songId, lineIndex: w.lineIndex }]
      if (ctxs.some((x) => x.lineIndex === i)) spans.push({ text: w.surfaceForm, id: w.id, className: 'w' })
    }
    song.connectedSpeech.forEach((cs, k) => {
      if (cs.lineIndex === i) spans.push({ text: cs.written, id: `cs:${k}`, className: 'cs' })
    })
    return spans
  }
  const hrefFor = (id: string) =>
    id.startsWith('cs:') ? undefined : href({ name: 'study', songId, itemId: id })

  const chunkCount = chunks.filter((c) => !c.suspended).length
  const wordCount = words.filter((w) => w.songId === songId && w.triage !== 'known' && !w.suspended).length
  const gp = song.grammarPoint

  return (
    <main class="screen study">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'songs' })} aria-label="Indietro">‹</a>
        <div class="grow">
          <h1>{song.title}</h1>
          <p class="note">{`Studio · ${chunkCount} chunk · ${wordCount} parole`}</p>
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
          <span>{`${pending} parole nuove da smistare`}</span>
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
          <p key={i}><Highlighted line={l} spans={spansFor(i)} hrefFor={hrefFor} /></p>
        ))}
      </div>

      {song.spotifyUrl && (
        <footer class="study-foot">
          <a class="btn outline" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>
        </footer>
      )}

      {itemId && <ItemSheet song={song} itemId={itemId} />}
    </main>
  )
}
