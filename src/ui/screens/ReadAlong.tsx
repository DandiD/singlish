import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { useWakeLock } from '../useWakeLock'
import { goBackTo, href, onBack, onBackTo, stillHere } from '../../router'
import { chorusLines } from '../../domain/chorus'
import { readingLines, saveReadAlong } from '../../domain/readAlong'
import { itemsInSong } from '../../domain/songItems'
import { Highlighted } from '../components/Highlighted'
import { Icon } from '../components/Icon'

/** Lettura a tempo: una riga alla volta, avanti e indietro a mano mentre la canzone suona fuori dall'app. */
export function ReadAlong({ songId }: { songId: string }) {
  const { db, now } = useDeps()
  const data = useLive(async () => {
    const song = (await db.songs.get(songId)) ?? null
    const chunks = (await db.chunks.toArray()).filter((c) => c.contexts.some((x) => x.songId === songId))
    const words = (await db.words.toArray()).filter((w) => w.contexts.some((x) => x.songId === songId))
    return { song, chunks, words }
  }, [db, songId])
  const [idx, setIdx] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  // Un doppio tocco su «Letta tutta» salva e torna indietro una volta sola.
  const acting = useRef(false)
  useWakeLock(true)

  const song = data?.song ?? null
  const lines = song ? readingLines(song) : []
  const count = lines.length
  const last = idx >= count - 1

  const forward = () => { if (open) { setOpen(null); return } if (!last) setIdx(idx + 1) }
  const backward = () => { if (open) { setOpen(null); return } if (idx > 0) setIdx(idx - 1) }
  const keys = useRef({ forward, backward, open })
  keys.current = { forward, backward, open }
  // Toccare fuori dalla nuvoletta (o premere Esc) la chiude soltanto: forward/backward non cambiano riga.

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const k = keys.current
      if (e.key === 'Escape') {
        if (k.open) { e.preventDefault(); setOpen(null) }
        return
      }
      if (e.key === ' ' && t instanceof HTMLElement && (/^(BUTTON|A)$/.test(t.tagName) || t.getAttribute('role') === 'button')) return // lo attiva il pulsante stesso
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); k.forward() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); k.backward() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (data === undefined) return <main class="screen read-along" aria-busy="true" />
  if (song === null) {
    return (
      <main class="screen">
        <h1>Canzone non trovata</h1>
        <a class="btn outline" href={href({ name: 'songs' })} onClick={onBackTo({ name: 'songs' })}>Torna alle canzoni</a>
      </main>
    )
  }

  const isText = song.kind === 'text'
  const study = { name: 'study', songId } as const
  const hasChorus = !isText && chorusLines(song.lines).length > 0
  const line = lines[Math.min(idx, count - 1)]
  const next = lines[idx + 1]
  const spans = line ? itemsInSong(song, data.chunks, data.words).spansByLine[line.lineIndex].filter((s) => !s.id.startsWith('cs:')) : []
  const item = open ? data.chunks.find((c) => c.id === open) ?? data.words.find((w) => w.id === open) : undefined

  const done = async () => {
    if (acting.current) return
    acting.current = true
    const here = stillHere()
    try {
      await saveReadAlong(db, songId, now())
      if (here()) goBackTo(study)
    } catch (e) {
      acting.current = false
      reportError(e)
    }
  }

  return (
    <main class="screen read-along">
      <header class="settings-head">
        <a class="icon-btn" href={href(study)} onClick={onBack(study)} aria-label="Esci"><Icon name="close" /></a>
        <div class="grow">
          <h1>{isText ? 'Leggi riga per riga' : 'Leggi a tempo'}</h1>
          <p class="note">{song.title}</p>
        </div>
      </header>
      {(song.spotifyUrl && !isText || hasChorus) && (
        <div class="ra-tools">
          {song.spotifyUrl && !isText && <a class="btn outline" href={song.spotifyUrl} target="_blank" rel="noopener noreferrer">Apri in Spotify ↗</a>}
          {hasChorus && <a class="btn outline" href={href({ name: 'chorus', songId })}>Solo il ritornello</a>}
        </div>
      )}
      {line ? (
        <div class="ra-stage">
          <div class="ra-zone prev" aria-hidden="true" onClick={backward} />
          <div class="ra-zone next" aria-hidden="true" onClick={forward} />
          <div class="ra-text">
            <p class="note ra-count">{`Riga ${idx + 1} di ${count}`}</p>
            <div class="ra-current" aria-live="polite">
              {line.chorus && <span class="ra-tag">ritornello</span>}
              <p key={idx} class="ra-line" lang="en">
                <Highlighted line={line.text} spans={spans} onPick={(id) => setOpen((cur) => (cur === id ? null : id))} openId={open} />
              </p>
            </div>
            {item && (
              <div class="ra-bubble" onClick={(e) => e.stopPropagation()}>
                <span class="ra-bubble-form" lang="en">{item.surfaceForm}</span>
                <span>{item.meaningIt}</span>
              </div>
            )}
            {next && <p class="ra-next" aria-hidden="true" lang="en">{next.text}</p>}
          </div>
        </div>
      ) : (
        <p class="note">Non ci sono righe da leggere.</p>
      )}
      {line && (
        <footer class="ra-foot grid2">
          <button type="button" class="btn outline" disabled={idx === 0} onClick={() => { setOpen(null); if (idx > 0) setIdx(idx - 1) }}>Indietro</button>
          {last ? (
            <button type="button" class="btn primary" onClick={() => void done()}>{isText ? 'Letto tutto' : 'Letta tutta'}</button>
          ) : (
            <button type="button" class="btn primary" onClick={() => { setOpen(null); setIdx(idx + 1) }}>Avanti</button>
          )}
        </footer>
      )}
    </main>
  )
}
