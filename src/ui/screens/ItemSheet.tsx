import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { goBackTo, href } from '../../router'
import { excludeItem, expandChildren } from '../../domain/ingest'
import { canExpand } from '../../domain/expand'
import { Highlighted } from '../components/Highlighted'
import { CHUNK_CLASS, formIn } from '../../domain/songItems'
import type { Chunk, ChunkType, Register, Song, Word } from '../../db/types'
import { Icon } from '../components/Icon'

const TYPE_LABEL: Record<ChunkType, string> = {
  phrasal_verb: 'Phrasal verb',
  idiom: 'Idioma',
  collocation: 'Collocazione',
  fixed_phrase: 'Espressione fissa',
  slang: 'Slang',
}
const REGISTER_LABEL: Record<Register, string> = { usable: 'Usabile', informal: 'Informale', song_only: 'Solo canzone' }

type Found = ({ kind: 'chunk'; item: Chunk } | { kind: 'word'; item: Word }) & { children: number } | null

export function ItemSheet({ song, itemId }: { song: Song; itemId: string }) {
  const { db } = useDeps()
  const found = useLive(
    async (): Promise<Found> => {
      const children = await expandChildren(db, itemId)
      const c = await db.chunks.get(itemId)
      if (c) return { kind: 'chunk', item: c, children }
      const w = await db.words.get(itemId)
      return w ? { kind: 'word', item: w, children } : null
    },
    [db, itemId],
  )
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [meaning, setMeaning] = useState('')
  const [explanation, setExplanation] = useState('')
  // Chiudendo la scheda mentre si modifica (velo, Esc, X), la modifica si salva invece di perdersi.
  const editing = useRef<(() => Promise<void>) | null>(null)
  const { ref, closing, close } = useSheet(song.id, itemId, !!found, () => editing.current?.())

  useEffect(() => {
    if (found === null) void close() // elemento inesistente o appena eliminato
  }, [found])

  if (!found) return null
  const { kind, item, children } = found
  const table = kind === 'chunk' ? db.chunks : db.words
  const title = kind === 'chunk' ? item.baseForm : item.lemma
  const own = item.contexts.find((c) => c.songId === song.id)
  const lineIdx = own?.lineIndex ?? item.lineIndex
  // Una voce di Espandi non viene dal testo: niente verso della canzone, resta l'esempio.
  // Nemmeno se la voce non ha un verso in questa canzone (scheda aperta dall'indirizzo, parola del profilo): niente riga altrui.
  const line = item.origin === 'expand' || !own ? undefined : song.lines[lineIdx]
  const surface = formIn(line ?? '', [own?.surfaceForm, item.surfaceForm, kind === 'chunk' ? item.baseForm : item.lemma])
  const translation = line ? song.lineTranslations?.find((t) => t.lineIndex === lineIdx)?.textIt : undefined

  const startEdit = () => { setMeaning(item.meaningIt); setExplanation(item.explanationIt); setMode('edit') }
  const canSave = meaning.trim() !== ''
  const changed = meaning.trim() !== item.meaningIt || explanation.trim() !== item.explanationIt
  const save = async () => {
    if (!canSave) return
    try {
      await (table as typeof db.chunks).update(item.id, { meaningIt: meaning.trim(), explanationIt: explanation.trim(), userEdited: true })
      setMode('view')
    } catch (e) {
      reportError(e)
    }
  }
  editing.current = mode === 'edit' && canSave && changed ? save : null
  // Sospendere è reversibile: una voce sospesa esce dal ripasso finché non la si riattiva.
  const setSuspended = async (suspended: boolean) => {
    try { await (table as typeof db.chunks).update(item.id, { suspended }) } catch (e) { reportError(e) }
  }
  const exclude = async () => {
    try {
      await excludeItem(db, item.id)
      void close()
    } catch (e) {
      reportError(e)
      setMode('view')
    }
  }

  const label = kind === 'chunk' ? 'Scheda del chunk' : 'Scheda della parola'
  return (
    <div class={closing ? 'sheet-scrim closing' : 'sheet-scrim'} onClick={(e) => { if (e.target === e.currentTarget) void close() }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <button type="button" class="icon-btn sheet-close" aria-label="Chiudi" onClick={() => void close()}><Icon name="close" /></button>
        <div class="chips">
          {kind === 'chunk' && <span class={`chip t-${item.type}`}>{TYPE_LABEL[item.type]}</span>}
          {kind === 'word' && <span class="chip">Parola</span>}
          <span class="chip">{item.cefr}</span>
          <span class="chip">{REGISTER_LABEL[item.register]}</span>
          {item.suspended && <span class="chip">Sospesa</span>}
        </div>
        <h2 class="sheet-title">{title}</h2>

        {mode === 'edit' ? (
          <form class="sheet-edit" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <label class="field">Significato
              <input value={meaning} onInput={(e) => setMeaning((e.target as HTMLInputElement).value)} />
            </label>
            <label class="field">Spiegazione
              <textarea rows={4} value={explanation} onInput={(e) => setExplanation((e.target as HTMLTextAreaElement).value)} />
            </label>
            <div class="grid2">
              <button type="submit" class="btn primary" disabled={!canSave}>Salva</button>
              <button type="button" class="btn outline" onClick={() => setMode('view')}>Annulla</button>
            </div>
          </form>
        ) : (
          <>
            <p class="sheet-meaning">{item.meaningIt}</p>
            {item.explanationIt && <p class="sheet-expl">{item.explanationIt}</p>}
          </>
        )}

        <div class="examples">
          {line && (
            <div>
              <div class="section-label">{`NELLA CANZONE · RIGA ${lineIdx + 1}`}</div>
              <p><Highlighted line={line} spans={[{ text: surface, id: item.id, className: kind === 'chunk' ? CHUNK_CLASS[item.type] : 'w' }]} /></p>
            </div>
          )}
          {item.extraExampleEn && (
            <div>
              <div class="section-label">NEL PARLATO</div>
              <p lang="en">{item.extraExampleEn}</p>
            </div>
          )}
          {kind === 'chunk' && item.pronunciationNoteIt && song.kind !== 'text' && (
            <div>
              <div class="section-label">PRONUNCIA</div>
              <p>{item.pronunciationNoteIt}</p>
            </div>
          )}
          {translation && (
            <div>
              <div class="section-label">TRADUZIONE DEL VERSO</div>
              <p>{translation}</p>
            </div>
          )}
        </div>

        {/* Espandi solo per le parole in studio, e non per quelle nate da Espandi (niente voci di voci). */}
        {kind === 'word' && mode === 'view' && canExpand(item as Word) && (
          <a class="btn outline expand-link" href={href({ name: 'expand', wordId: item.id })}>Espandi</a>
        )}

        {mode === 'confirm' ? (
          <div class="confirm" role="alert">
            <p>{`Togliere questo elemento e le sue card? ${kind === 'word' && item.wasKnown ? 'Torna fra le parole che sai: non ti verrà riproposta.' : 'Se compare in una canzone nuova, ti verrà proposto di nuovo.'}${children > 0 ? ` Con lei esce anche ${children === 1 ? '1 voce aggiunta' : `${children} voci aggiunte`} con Espandi.` : ''}`}</p>
            <div class="grid2">
              <button type="button" class="btn outline danger" onClick={() => void exclude()}>Sì, escludi</button>
              <button type="button" class="btn outline" onClick={() => setMode('view')}>Annulla</button>
            </div>
          </div>
        ) : (
          mode === 'view' && (
            <div class="grid3">
              <button type="button" class="btn outline" onClick={startEdit}>Modifica</button>
              <button type="button" class="btn outline" onClick={() => void setSuspended(!item.suspended)}>
                {item.suspended ? 'Riattiva' : 'Sospendi'}
              </button>
              <button type="button" class="btn outline danger" onClick={() => setMode('confirm')}>Escludi</button>
            </div>
          )
        )}
      </section>
    </div>
  )
}

/**
 * Comportamento comune dei fogli dal basso: chiusura animata (una sola volta), Esc, fuoco dentro all'apertura
 * e di nuovo su chi l'ha aperto alla chiusura. `beforeClose` gira prima di chiudere (es. salvare una modifica).
 */
export function useSheet(songId: string, itemId: string, loaded: boolean, beforeClose?: () => Promise<void> | undefined) {
  const ref = useRef<HTMLElement>(null)
  const [closing, setClosing] = useState(false)
  const done = useRef(false)
  const before = useRef(beforeClose)
  before.current = beforeClose
  const close = async () => {
    if (done.current) return // Escludi e «voce sparita» chiedono entrambi di chiudere: si chiude una volta
    done.current = true
    await before.current?.()
    const go = () => goBackTo({ name: 'study', songId })
    // Il foglio scende prima di sparire; con movimento ridotto si chiude subito.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return go()
    setClosing(true)
    setTimeout(go, 200)
  }
  // Alla chiusura il fuoco torna a chi ha aperto il foglio. Safari non dà il fuoco ai link toccati:
  // in quel caso si torna al link dell'elemento nel testo.
  useEffect(() => {
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    return () => {
      const sel = `a[href$="item=${encodeURIComponent(itemId)}"]`
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(`.lyrics ${sel}, .other-items ${sel}`)
      target?.focus()
    }
  }, [])
  // Il foglio compare solo quando i dati sono arrivati: il fuoco va spostato allora. Fuoco ed Esc partono
  // insieme al disegno del foglio (layout effect): nessun istante in cui il foglio è visibile ma sordo.
  useLayoutEffect(() => { if (loaded) ref.current?.focus() }, [loaded])
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [songId])
  return { ref, closing, close }
}

/** Foglio di un fenomeno di parlato connesso: come si scrive, come si canta, perché. */
export function SpeechSheet({ song, itemId }: { song: Song; itemId: string }) {
  const cs = song.connectedSpeech[Number(itemId.slice(3))]
  const { ref, closing, close } = useSheet(song.id, itemId, !!cs)
  useEffect(() => { if (!cs) void close() }, [cs])
  if (!cs) return null
  return (
    <div class={closing ? 'sheet-scrim closing' : 'sheet-scrim'} onClick={(e) => { if (e.target === e.currentTarget) void close() }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Pronuncia" tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <button type="button" class="icon-btn sheet-close" aria-label="Chiudi" onClick={() => void close()}><Icon name="close" /></button>
        <div class="chips"><span class="chip">Pronuncia</span></div>
        <h2 class="sheet-title" lang="en">{cs.written}</h2>
        <p class="sheet-meaning">Si canta <strong lang="en">{cs.sung}</strong></p>
        {cs.noteIt && <p class="sheet-expl">{cs.noteIt}</p>}
        {song.lines[cs.lineIndex] && (
          <div class="examples">
            <div>
              <div class="section-label">{`NELLA CANZONE · RIGA ${cs.lineIndex + 1}`}</div>
              <p lang="en"><Highlighted line={song.lines[cs.lineIndex]} spans={[{ text: cs.written, id: itemId, className: 'cs' }]} /></p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
