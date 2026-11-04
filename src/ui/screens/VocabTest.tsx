import { useEffect, useRef, useState } from 'preact/hooks'
import { useDeps } from '../deps'
import { useFailure } from '../useFailure'
import { reportError } from '../report'
import { goReplace, href, onBack, stillHere } from '../../router'
import { loadFreqList } from '../../domain/freq'
import { buildVocabTest, scoreVocabTest, suggestedBand, vocabTestAvailable, type VocabItem, type VocabResult } from '../../domain/vocabTest'
import { getSettings, saveSettings } from '../../domain/settings'
import { Icon } from '../components/Icon'
import { formatNumber } from '../format'
import type { Settings } from '../../db/types'

const num = formatNumber
const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long' })
const kLabel = (to: number) => `${to / 1000}k`

/** Test di vocabolario sì/no (canvas: VocabTest, VocabResult). */
export function VocabTest() {
  const { db, fetch, now } = useDeps()
  const fail = useFailure()
  const [items, setItems] = useState<VocabItem[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [answers, setAnswers] = useState<boolean[]>([])
  const given = useRef<boolean[]>([])
  const [result, setResult] = useState<{ r: VocabResult; previous: Settings['vocabTests'] } | null>(null)

  useEffect(() => {
    loadFreqList(fetch).then((list) => {
      if (vocabTestAvailable(list)) setItems(buildVocabTest(list, Math.random))
      else setUnavailable(true)
    }).catch(fail)
  }, [])

  if (unavailable) {
    return (
      <main class="screen vocab-test">
        <header class="settings-head">
          <a class="icon-btn" href={href({ name: 'progress' })} onClick={onBack({ name: 'progress' })} aria-label="Indietro"><Icon name="back" /></a>
          <h1>Test di vocabolario</h1>
        </header>
        <p class="note">La lista di frequenza delle parole non è ancora completa, quindi il test non può stimare il vocabolario. Torna a provarlo dopo il prossimo aggiornamento dell'app.</p>
      </main>
    )
  }
  if (!items) return <main class="screen vocab-test" aria-busy="true" />

  // Le risposte stanno in un riferimento: tocchi rapidi non leggono uno stato vecchio e non si perdono.
  const answer = async (yes: boolean) => {
    if (given.current.length >= items.length) return
    const next = [...given.current, yes]
    given.current = next
    setAnswers(next)
    if (next.length < items.length) return
    const r = scoreVocabTest(items, next)
    try {
      const s = await getSettings(db)
      await saveSettings(db, { vocabTests: [...(s.vocabTests ?? []), { at: now(), estimate: r.estimate, falseAlarms: r.falseAlarms }] })
      setResult({ r, previous: s.vocabTests })
    } catch (e) {
      reportError(e)
    }
  }

  if (result) return <VocabResultView {...result} />
  if (answers.length >= items.length) return <main class="screen vocab-test" aria-busy="true" />

  const i = answers.length
  return (
    <main class="screen vocab-test">
      <header class="session-head">
        <a class="icon-btn" href={href({ name: 'progress' })} onClick={onBack({ name: 'progress' })} aria-label="Interrompi il test"><Icon name="close" /></a>
        <div class="grow">
          <span class="note">{`Parola ${i + 1} di ${items.length}`}</span>
          <div class="bar" aria-hidden="true"><div class="bar-fill" style={{ transform: `scaleX(${i / items.length})` }} /></div>
        </div>
      </header>
      <div class="vt-main">
        <span class="note">Conosci questa parola?</span>
        <span class="vt-word" lang="en">{items[i].word}</span>
        <p class="note center">Alcune parole sono inventate. Rispondi sì solo se sapresti dire cosa significa.</p>
      </div>
      <div class="grid2 vt-answers">
        <button type="button" class="btn outline" onClick={() => void answer(false)}>Non la conosco</button>
        <button type="button" class="btn primary" onClick={() => void answer(true)}>La conosco</button>
      </div>
    </main>
  )
}

function VocabResultView({ r, previous }: { r: VocabResult; previous: Settings['vocabTests'] }) {
  const { db } = useDeps()
  const last = previous?.at(-1)
  const delta = last ? r.estimate - last.estimate : null
  const [from, to] = suggestedBand(r.estimate)
  const useful = (b: VocabResult['bands'][number]) => b.to > from && b.from <= to
  const pct = (b: VocabResult['bands'][number]) => (b.total ? Math.round((b.known / b.total) * 100) : 0)
  const label = `Percentuale di parole note per fascia: ${r.bands.map((b) => `${pct(b)}% fino a ${num(b.to)}`).join(', ')}`
  const update = async () => {
    const here = stillHere()
    try {
      await saveSettings(db, { bandStart: from, bandEnd: to, bandFromTest: true })
      if (here()) goReplace({ name: 'progress' })
    } catch (e) {
      reportError(e)
    }
  }
  return (
    <main class="screen vocab-test">
      <header class="settings-head">
        <a class="icon-btn" href={href({ name: 'progress' })} onClick={onBack({ name: 'progress' })} aria-label="Indietro"><Icon name="back" /></a>
        <h1>Il tuo vocabolario</h1>
      </header>
      <section class="card vt-estimate">
        <span class="note">Parole che riconosci, stima</span>
        <span class="vt-num">{`≈ ${num(r.estimate)}`}</span>
        {delta !== null && last && (
          <span class={delta >= 0 ? 'vt-delta up' : 'vt-delta'}>{`${delta >= 0 ? '+' : ''}${num(delta)} rispetto al test di ${monthFmt.format(last.at)}`}</span>
        )}
      </section>
      <section class="card vt-bands">
        <h2>Parole note per fascia di frequenza</h2>
        <div class="bars" role="img" aria-label={label}>
          {r.bands.map((b) => (
            <div class="bar-col" key={b.to}>
              <span class="note">{`${pct(b)}%`}</span>
              <div class="bar-track"><div class={useful(b) ? 'bar-v useful' : 'bar-v'} style={{ height: `${pct(b)}%` }} /></div>
              <span class="note">{kLabel(b.to)}</span>
            </div>
          ))}
        </div>
        <p class="note">{r.bands.some(useful) ? `In arancio la fascia utile suggerita: ${num(from)}–${num(to)}` : `Fascia utile suggerita: ${num(from)}–${num(to)}`}</p>
      </section>
      <p class="note info-box">{`Parole inventate segnate come note: ${r.falseAlarms} su 20. La stima è già corretta per questo.`}</p>
      <div class="grid-stack">
        <button type="button" class="btn primary cta" onClick={() => void update()}>Aggiorna la fascia utile</button>
        <a class="btn outline" href={href({ name: 'progress' })} onClick={(e) => { e.preventDefault(); goReplace({ name: 'progress' }) }}>Tieni quella attuale</a>
      </div>
    </main>
  )
}
