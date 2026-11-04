import { useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { geminiProblem } from '../errors'
import { goReplace, href, onBack, stillHere } from '../../router'
import { confirmProductions, correctProductions, pendingProductions, type Feedback as FeedbackItem } from '../../domain/production'
import { getSettings } from '../../domain/settings'
import { RATING_LABEL } from '../components/RatingBar'
import { useOnline } from '../components/OfflineBadge'
import { Icon } from '../components/Icon'
import { plural } from '../plural'
import type { Rating } from '../../db/types'

const VERDICT: Record<FeedbackItem['verdict'], { label: string; cls: string }> = {
  correct: { label: 'Corretta', cls: 'ok' },
  fix: { label: 'Da sistemare', cls: 'fix' },
  wrong: { label: 'Da rifare', cls: 'wrong' },
}

/** Le tue frasi: le frasi delle card Produci, corrette da Gemini con una sola chiamata; si confermano i voti. */
export function Feedback() {
  const { db, fetch, sleep, now } = useDeps()
  const pending = useLive(() => pendingProductions(db), [db])
  const online = useOnline()
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!pending) return <main class="screen fb-screen" aria-busy="true" />

  const correct = async () => {
    setBusy(true)
    setError('')
    try {
      const got = await correctProductions(db, { fetch, sleep })
      // Nessuna correzione nella risposta: le frasi restano da correggere, si riprova (niente «0 frasi corrette»).
      if (got.length === 0) setError('Gemini non ha corretto nessuna frase: restano da correggere. Riprova.')
      else setItems(got)
    } catch (e) {
      const model = await getSettings(db).then((s) => s.model, () => '')
      const p = geminiProblem(e, model)
      setError(`${p.title}. ${p.text}`)
    } finally {
      setBusy(false)
    }
  }
  const confirm = async () => {
    if (!items) return
    setBusy(true)
    const here = stillHere()
    try {
      const { desiredRetention } = await getSettings(db)
      await confirmProductions(db, items, now(), desiredRetention)
      if (here()) goReplace({ name: 'today' })
    } catch (e) {
      reportError(e)
      setBusy(false)
    }
  }
  const setRating = (cardId: string, rating: Rating) => setItems((cur) => cur && cur.map((x) => (x.cardId === cardId ? { ...x, rating } : x)))

  return (
    <main class="screen fb-screen">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'today' })} onClick={onBack({ name: 'today' })} aria-label="Indietro"><Icon name="back" /></a>
        <div class="grow">
          <h1>Le tue frasi</h1>
          <p class="note">{items ? `Corrette da Gemini · ${plural(items.length, 'frase', 'frasi')}` : plural(pending.length, 'frase da correggere', 'frasi da correggere')}</p>
        </div>
      </header>

      {!items && (
        pending.length === 0 ? (
          <p class="note">Nessuna frase da correggere. Le frasi che scrivi nelle card Produci arrivano qui appena le scrivi.</p>
        ) : (
          <>
            <ul class="pending-list">
              {pending.map((p) => <li key={p.cardId} lang="en">{p.sentence}</li>)}
            </ul>
            {error && <p class="note danger" role="alert">{error}</p>}
            {!online && <p class="note">Sei offline: le frasi restano qui finché torna la connessione.</p>}
            <button type="button" class="btn primary cta" disabled={busy || !online} onClick={() => void correct()}>
              {busy ? 'Correggo…' : 'Correggi con Gemini'}
            </button>
            <p class="note center">Una sola chiamata per tutte le frasi.</p>
          </>
        )
      )}

      {items && (
        <>
          {items.length < pending.length && (
            <p class="note info-box">{`Gemini non ha corretto ${pending.length - items.length === 1 ? '1 frase: resta' : `${pending.length - items.length} frasi: restano`} da correggere per la prossima volta.`}</p>
          )}
          {items.map((it) => (
            <article key={it.cardId} class="fb-item">
              <div class="fb-top">
                <span class="hl id" lang="en">{it.chunk}</span>
                <span class={`fb-verdict ${VERDICT[it.verdict].cls}`}>{VERDICT[it.verdict].label}</span>
              </div>
              {it.verdict === 'correct' ? (
                <p lang="en">{it.sentence}</p>
              ) : (
                <>
                  <p lang="en" class="fb-old"><s>{it.sentence}</s></p>
                  <p lang="en"><strong>{it.corrected}</strong></p>
                </>
              )}
              <p class="note">{it.noteIt}</p>
              <label class="fb-rating">
                Voto proposto
                <select value={String(it.rating)} onChange={(e) => setRating(it.cardId, Number((e.currentTarget as HTMLSelectElement).value) as Rating)}>
                  {([3, 4, 2, 1] as Rating[]).map((r) => <option key={r} value={String(r)}>{RATING_LABEL[r]}</option>)}
                </select>
              </label>
            </article>
          ))}
          <button type="button" class="btn primary cta" disabled={busy} onClick={() => void confirm()}>Conferma i voti</button>
        </>
      )}
    </main>
  )
}
