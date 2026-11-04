import { useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { geminiProblem } from '../errors'
import { goBack, href, onBack } from '../../router'
import { addExpansion, canExpand, expansionPlan, requestExpansion, type Expansion } from '../../domain/expand'
import { getSettings } from '../../domain/settings'
import { useOnline } from '../components/OfflineBadge'
import { Icon } from '../components/Icon'
import { plural } from '../plural'

const POS: Record<string, string> = { noun: 'nome', verb: 'verbo', adjective: 'aggettivo', adverb: 'avverbio' }

/** Espandi una parola (canvas: Expand): famiglia, collocazioni, contrari, sfumature; una chiamata, poi salvata. */
export function Expand({ wordId }: { wordId: string }) {
  const { db, fetch, sleep, now } = useDeps()
  const data = useLive(async () => {
    const word = (await db.words.get(wordId)) ?? null
    const song = word ? (await db.songs.get(word.songId)) ?? null : null
    const [words, chunks, cards] = await Promise.all([db.words.toArray(), db.chunks.toArray(), db.cards.toArray()])
    return { word, song, words, chunks, cards }
  }, [db, wordId])
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<string> | null>(null)

  if (!data) return <main class="screen expand" aria-busy="true" />
  const { word, song, words, chunks, cards } = data
  if (!word) return <main class="screen"><h1>Parola non trovata</h1></main>
  const e = word.expansion
  // Di partenza sono scelte la famiglia, le collocazioni e le sfumature; i contrari si aggiungono a mano.
  const defaults = (x: Expansion) => new Set([...x.family.map((r) => `f:${r.lemma}`), ...x.collocations.map((c) => `c:${c.base_form}`), ...(x.nuance ? ['n'] : [])])
  const sel = picked ?? (e ? defaults(e) : new Set<string>())
  const toggle = (k: string) => { const n = new Set(sel); if (n.has(k)) n.delete(k); else n.add(k); setPicked(n) }

  const ask = async () => {
    setBusy(true); setError('')
    try { await requestExpansion(db, wordId, { fetch, sleep }) } catch (err) {
      const model = await getSettings(db).then((s) => s.model, () => '')
      const p = geminiProblem(err, model)
      setError(`${p.title}. ${p.text}`)
    } finally { setBusy(false) }
  }
  const add = async () => {
    if (!e) return
    setBusy(true)
    try {
      await addExpansion(db, wordId, pickOf(e), now())
      goBack({ name: 'lexicon' })
    } catch (err) {
      reportError(err)
      setBusy(false)
    }
  }
  const row = (k: string, title: string, sub: string) => (
    <label key={k} class="ex-row">
      <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} />
      <span><span class="ex-title" lang="en">{title}</span><span class="note">{sub}</span></span>
    </label>
  )
  // Il numero annunciato è quello che l'aggiunta farà davvero (voci già presenti escluse).
  const pickOf = (x: Expansion) => ({
    family: x.family.filter((r) => sel.has(`f:${r.lemma}`)).map((r) => r.lemma),
    collocations: x.collocations.filter((c) => sel.has(`c:${c.base_form}`)).map((c) => c.base_form),
    opposites: x.opposites.filter((r) => sel.has(`o:${r.lemma}`)).map((r) => r.lemma),
    nuance: sel.has('n'),
  })
  const count = e ? expansionPlan(words, chunks, word, pickOf(e), cards).cards : 0

  return (
    <main class="screen expand">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'lexicon' })} onClick={onBack({ name: 'lexicon' })} aria-label="Indietro"><Icon name="back" /></a>
        <div class="grow">
          <h1>{`Espandi «${word.lemma}»`}</h1>
          <p class="note">{[song?.title, POS[word.pos] ?? word.pos, word.cefr].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      {!canExpand(word) ? (
        <>
          <p class="note info-box">Questa parola non si può espandere: Espandi vale per le parole in studio e attive, non per quelle sospese, da smistare o nate da Espandi.</p>
          <a class="btn outline" href={href({ name: 'lexicon' })} onClick={onBack({ name: 'lexicon' })}>Torna al Lessico</a>
        </>
      ) : !e ? (
        <>
          <p class="note info-box">Gemini propone le parole della stessa famiglia, le collocazioni, i contrari e le sfumature da non confondere. Una sola chiamata: il risultato resta salvato.</p>
          {error && <p class="note danger" role="alert">{error}</p>}
          {!online && <p class="note">Sei offline: per chiedere a Gemini serve la connessione.</p>}
          <button type="button" class="btn primary cta" disabled={busy || !online} onClick={() => void ask()}>{busy ? 'Chiedo…' : 'Chiedi a Gemini'}</button>
        </>
      ) : (
        <>
          {e.family.length > 0 && <section class="ex-group"><h2 class="section-label">FAMIGLIA</h2>{e.family.map((r) => row(`f:${r.lemma}`, r.lemma, `${r.meaning_it} · ${POS[r.pos] ?? r.pos}`))}</section>}
          {e.collocations.length > 0 && <section class="ex-group"><h2 class="section-label">COLLOCAZIONI</h2>{e.collocations.map((c) => row(`c:${c.base_form}`, c.base_form, c.meaning_it))}</section>}
          {e.opposites.length > 0 && <section class="ex-group"><h2 class="section-label">CONTRARIO</h2>{e.opposites.map((r) => row(`o:${r.lemma}`, r.lemma, r.meaning_it))}</section>}
          {e.nuance && <section class="ex-group"><h2 class="section-label">SFUMATURE</h2>{row('n', e.nuance.options.join(' · '), e.nuance.summary_it)}</section>}
          <footer class="ex-foot">
            <p class="note center">{`${plural(count, 'card nuova', 'card nuove')} · entrano dopo chunk e parole delle canzoni`}</p>
            <button type="button" class="btn primary cta" disabled={count === 0 || busy} onClick={() => void add()}>{count === 0 ? 'Niente di nuovo da aggiungere' : `Aggiungi ${count} card al ripasso`}</button>
          </footer>
        </>
      )}
    </main>
  )
}
