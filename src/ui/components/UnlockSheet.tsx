import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { useDeps } from '../deps'
import { useLive } from '../useLive'
import { reportError } from '../report'
import { href, stillHere } from '../../router'
import { readiness, INTENSIVE, type Readiness } from '../../domain/readiness'
import { estimateAvgSeconds } from '../../domain/queue'
import { getSettings, saveSettings } from '../../domain/settings'
import { MAX_OPEN_SONGS } from '../../domain/ingest'
import { plural } from '../plural'
import type { Settings } from '../../db/types'

const DAY = 86_400_000

/** Minuti al giorno da mostrare: vicino al tetto si mostra un decimale, così «30′» non sembra «oltre i 30′». */
export function loadLabel(minutes: number, limit: number): string {
  const rounded = Math.round(minutes)
  if (!(Math.abs(minutes - limit) < 1 && rounded === limit && minutes !== limit)) return String(rounded)
  // Il decimale va dalla parte giusta del tetto: sopra si arrotonda in su, sotto in giù.
  const tenth = minutes > limit ? Math.ceil(minutes * 10) / 10 : Math.floor(minutes * 10) / 10
  return tenth.toFixed(1).replace('.', ',')
}

/**
 * «Aggiungi»: se le canzoni in corso hanno ancora voci fuori dal ripasso o il carico supera il tetto,
 * prima di aprire Aggiungi canzone un foglio spiega perché e lascia scegliere (canvas: Unlock).
 */
export function useAddGate(): { request(target?: 'addSong' | 'addText'): void; sheet: JSX.Element | null } {
  const { db, now } = useDeps()
  const [state, setState] = useState<{ r: Readiness; settings: Settings; target: 'addSong' | 'addText' } | null>(null)
  const request = (target: 'addSong' | 'addText' = 'addSong') => {
    const here = stillHere()
    void (async () => {
      const [settings, songs, chunks, words, cards, avgSeconds] = await Promise.all([
        getSettings(db), db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), db.cards.toArray(), estimateAvgSeconds(db),
      ])
      const r = readiness({ settings, songs, chunks, words, cards, avgSeconds }, now())
      // Toccato altrove mentre si controllava: non si apre Aggiungi sopra la scelta dell'utente.
      if (!here()) return
      if (r.ready) window.location.hash = href({ name: target })
      else setState({ r, settings, target })
    })().catch(reportError)
  }
  const sheet = state ? <UnlockSheet {...state} onClose={() => setState(null)} /> : null
  return { request, sheet }
}

function UnlockSheet({ r: first, settings, target, onClose }: { r: Readiness; settings: Settings; target: 'addSong' | 'addText'; onClose(): void }) {
  const { db, now } = useDeps()
  // Il foglio segue i dati mentre è aperto (un'analisi che finisce, una voce che entra nel ripasso).
  const live = useLive(async () => {
    const [s, songs, chunks, words, cards, avgSeconds] = await Promise.all([
      getSettings(db), db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), db.cards.toArray(), estimateAvgSeconds(db),
    ])
    return readiness({ settings: s, songs, chunks, words, cards, avgSeconds }, now())
  }, [db])
  const r = live ?? first
  const ref = useRef<HTMLElement>(null)
  const [intensive, setIntensive] = useState(!!settings.intensiveUntil && settings.intensiveUntil > now())
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => opener?.focus?.()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const minutes = settings.timerMinutes.review
  const toggleIntensive = (on: boolean) => {
    setIntensive(on)
    saveSettings(db, { intensiveUntil: on ? new Date(now().getTime() + INTENSIVE.days * DAY) : null }).catch(reportError)
  }
  const title = target === 'addText' ? 'Il prossimo testo non è ancora pronto' : 'La prossima canzone non è ancora pronta'
  return (
    <div class="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section class="sheet unlock" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <h1>{title}</h1>
        <ul class="checks">
          {r.notInReview.map((x, i) => (
            <li key={`${i}:${x.title}`} class="todo">
              {`${x.title}: ${[
                x.chunks + x.words > 0 ? `${[x.chunks ? plural(x.chunks, 'chunk', 'chunk') : '', x.words ? plural(x.words, 'parola', 'parole') : ''].filter(Boolean).join(' e ')} non ancora nel ripasso` : '',
                x.toTriage ? plural(x.toTriage, 'parola da smistare', 'parole da smistare') : '',
              ].filter(Boolean).join('; ')}`}
            </li>
          ))}
          <li class={r.loadOk ? 'ok' : 'todo'}>
            {`Ripasso dei prossimi 7 giorni: ${loadLabel(r.loadMinutesPerDay, minutes)}′ al giorno, ${r.loadOk ? 'entro' : 'oltre'} i ${minutes}′`}
          </li>
          <li class={r.openSongs < MAX_OPEN_SONGS ? 'ok' : 'todo'}>{`Canzoni e testi aperti: ${r.openSongs} di ${MAX_OPEN_SONGS}`}</li>
        </ul>
        <div class="unlock-warn">
          <strong>Se forzi lo sblocco</strong>
          <span>{`${target === 'addText' ? 'Le card nuove del testo' : 'Le card nuove della canzone'} entrano nella coda insieme a quelle che aspettano già: il ripasso dei prossimi giorni cresce.`}</span>
        </div>
        <label class="intensive">
          <span>
            <strong>Modalità intensiva</strong>
            <span class="note">{`Fino a ${Math.max(INTENSIVE.newPerDay, settings.newPerDay)} nuove al giorno per ${INTENSIVE.days} giorni. Poi il ripasso può superare i ${settings.timerMinutes.review}′ del timer.`}</span>
          </span>
          <input type="checkbox" checked={intensive} onChange={(e) => toggleIntensive((e.currentTarget as HTMLInputElement).checked)} />
        </label>
        <div class="grid-stack">
          <button type="button" class="btn primary cta" disabled={r.openSongs >= MAX_OPEN_SONGS} onClick={() => { onClose(); window.location.hash = href({ name: target }) }}>Sblocca lo stesso</button>
          <button type="button" class="btn ghost-link" onClick={onClose}>Aspetto, va bene così</button>
        </div>
      </section>
    </div>
  )
}
