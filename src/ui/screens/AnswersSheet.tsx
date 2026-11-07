import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { geminiProblem } from '../errors'
import { plural } from '../plural'
import { useOnline } from '../components/OfflineBadge'
import { Icon } from '../components/Icon'
import { useSheet } from './ItemSheet'
import { askGemini, defaultKeep, dropDraft, keepAnswers, keepPlan, proposalKey } from '../../domain/askDraft'
import { getSettings } from '../../domain/settings'
import { normalizeKey } from '../../domain/text'
import type { Song } from '../../db/types'

/** Le risposte di Gemini in bozza: lo studente sceglie cosa entra nel ripasso. */
export function AnswersSheet({ song }: { song: Song }) {
  const { db, now, fetch, sleep } = useDeps()
  const online = useOnline()
  const draft = song.askDraft
  const lex = useLive(async () => ({ chunks: await db.chunks.toArray(), words: await db.words.toArray(), cards: await db.cards.toArray() }), [db])
  const [keep, setKeep] = useState<Set<string>>(() => (draft ? defaultKeep(draft) : new Set()))
  // Le risposte arrivate con «Riprova» partono con le voci chieste già spuntate; le scelte fatte restano.
  const seen = useRef(new Set(draft?.answers.map((a) => a.key)))
  useEffect(() => {
    if (!draft) return
    const fresh = draft.answers.filter((a) => !seen.current.has(a.key))
    if (fresh.length === 0) return
    fresh.forEach((a) => seen.current.add(a.key))
    setKeep((k) => new Set([...k, ...defaultKeep({ answers: fresh, unanswered: [] })]))
  }, [draft])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [msg, setMsg] = useState('')
  const { ref, closing, close } = useSheet(song.id, 'ask', !!draft && !!lex)

  // La bozza sparisce (Chiudi, o un'altra scheda): il foglio si chiude. Ma appena arrivate le risposte il dato vivo
  // può essere ancora indietro di un istante: prima di chiudere si controlla che la bozza manchi davvero nel database.
  useEffect(() => {
    if (draft) return
    let off = false
    db.songs.get(song.id).then((s) => { if (!off && !s?.askDraft) void close() }, reportError)
    return () => { off = true }
  }, [draft])
  if (!draft || !lex) return null

  const plan = keepPlan(lex.words, lex.chunks, lex.cards, draft, keep)
  const inLexicon = (base: string, kind: 'chunk' | 'word') =>
    kind === 'chunk' ? lex.chunks.some((c) => c.key === normalizeKey(base)) : lex.words.some((w) => w.lemma === base.trim().toLowerCase())
  const toggle = (key: string) => setKeep((k) => { const n = new Set(k); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const run = async (job: () => Promise<unknown>, after?: () => void) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMsg('')
    try {
      await job()
      after?.()
    } catch (e) {
      reportError(e)
      const model = await getSettings(db).then((x) => x.model, () => '')
      const p = geminiProblem(e, model)
      setMsg(`${p.title}. ${p.text}`)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const lines = [...new Set(draft.answers.map((a) => a.lineIndex))]

  return (
    <div class={closing ? 'sheet-scrim closing' : 'sheet-scrim'} onClick={(e) => { if (e.target === e.currentTarget) void close() }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Risposte di Gemini" tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <button type="button" class="icon-btn sheet-close" aria-label="Chiudi" onClick={() => void close()}><Icon name="close" /></button>
        <h2 class="sheet-title">Risposte di Gemini</h2>

        {lines.map((li) => {
          const group = draft.answers.filter((a) => a.lineIndex === li)
          const translation = group[0].translationIt
          return (
            <div class="ans-group" key={li}>
              <h3 lang="en">{song.lines[li]}</h3>
              <p class="ans-tr">{translation}</p>
              {group.map((a) => (
                <div key={a.key}>
                  {a.verse && (
                    <div class="ans-notes">
                      <div class="section-label">Senso</div><p>{a.verse.sense_it}</p>
                      {a.verse.grammar_it && <><div class="section-label">Grammatica</div><p>{a.verse.grammar_it}</p></>}
                      {a.verse.culture_it && <><div class="section-label">Cultura</div><p>{a.verse.culture_it}</p></>}
                    </div>
                  )}
                  {a.item && (
                    <div class="ex-row">
                      <input type="checkbox" id={`ans-${a.key}`} checked={keep.has(a.key)} onChange={() => toggle(a.key)} />
                      <div class="ans-body">
                        <label for={`ans-${a.key}`} class="ex-title" lang="en">{a.item.surface_form}</label>
                        <span>{a.item.meaning_it}</span>
                        <span class="note">{a.item.explanation_it}</span>
                        <span class="note" lang="en">{a.item.extra_example_en}</span>
                        {a.item.widened && a.text && <span class="note">allargata a <em lang="en">{a.item.surface_form}</em> (<span lang="en">{a.text}</span>)</span>}
                        {inLexicon(a.item.base_form, a.item.item_type) && <span class="chip">Già nel tuo lessico</span>}
                      </div>
                    </div>
                  )}
                  {a.verse?.proposals.map((p) => {
                    const k = proposalKey(a, p)
                    return (
                      <div class="ex-row" key={k}>
                        <input type="checkbox" id={`ans-${k}`} checked={keep.has(k)} onChange={() => toggle(k)} />
                        <div class="ans-body">
                          <label for={`ans-${k}`} class="ex-title" lang="en">{p.base_form}</label>
                          <span>{p.meaning_it}</span>
                          {inLexicon(p.base_form, 'chunk') && <span class="chip">Già nel tuo lessico</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )
        })}

        {draft.unanswered.length > 0 && (
          <div class="ans-group">
            {draft.unanswered.map((r) => (
              <p class="note" key={`${r.lineIndex}:${r.text ?? ''}`}>
                <span>Gemini non ha risposto su questo</span>: {r.text !== undefined ? <q lang="en">{r.text}</q> : `Verso ${r.lineIndex + 1}`}
              </p>
            ))}
            <button type="button" class="btn outline" disabled={!online || busy} onClick={() => void run(() => askGemini(db, song.id, draft.unanswered, { fetch, sleep }))}>Riprova</button>
          </div>
        )}

        {msg && <p class="note danger" role="alert">{msg}</p>}
        <div class="ex-foot">
          {plan.cards > 0 ? (
            <button type="button" class="btn primary" disabled={busy} onClick={() => void run(() => keepAnswers(db, song.id, keep, now()), () => void close())}>
              {`Aggiungi ${plural(plan.cards, 'card', 'card')} al ripasso`}
            </button>
          ) : (
            <button type="button" class="btn primary" disabled={busy} onClick={() => void run(() => keepAnswers(db, song.id, keep, now()), () => void close())}>Chiudi</button>
          )}
          <button type="button" class="btn outline" disabled={busy} onClick={() => void run(() => dropDraft(db, song.id), () => void close())}>Chiudi senza aggiungere</button>
        </div>
      </section>
    </div>
  )
}
