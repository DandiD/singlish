import { useEffect, useRef, useState } from 'preact/hooks'
import { useLive } from '../useLive'
import { useDeps } from '../deps'
import { reportError } from '../report'
import { goBackTo } from '../../router'
import { formIn, Highlighted } from '../components/Highlighted'
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

type Found = { kind: 'chunk'; item: Chunk } | { kind: 'word'; item: Word } | null

export function ItemSheet({ song, itemId }: { song: Song; itemId: string }) {
  const { db } = useDeps()
  const found = useLive(
    async (): Promise<Found> => {
      const c = await db.chunks.get(itemId)
      if (c) return { kind: 'chunk', item: c }
      const w = await db.words.get(itemId)
      return w ? { kind: 'word', item: w } : null
    },
    [db, itemId],
  )
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [meaning, setMeaning] = useState('')
  const [explanation, setExplanation] = useState('')
  const ref = useRef<HTMLElement>(null)
  const [closing, setClosing] = useState(false)
  const close = () => {
    const go = () => goBackTo({ name: 'study', songId: song.id })
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
      const target = opener?.isConnected
        ? opener
        : document.querySelector<HTMLElement>(`.lyrics a[href$="item=${encodeURIComponent(itemId)}"]`)
      target?.focus()
    }
  }, [])
  // Il foglio compare solo quando i dati sono arrivati: il fuoco va spostato allora.
  const loaded = !!found
  useEffect(() => { if (loaded) ref.current?.focus() }, [loaded])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [song.id])

  useEffect(() => {
    if (found === null) close() // elemento inesistente o appena eliminato
  }, [found])

  if (!found) return null
  const { kind, item } = found
  const table = kind === 'chunk' ? db.chunks : db.words
  const title = kind === 'chunk' ? item.baseForm : item.lemma
  const own = item.contexts.find((c) => c.songId === song.id)
  const lineIdx = own?.lineIndex ?? item.lineIndex
  const line = song.lines[lineIdx]
  const surface = formIn(line ?? '', [own?.surfaceForm, item.surfaceForm, kind === 'chunk' ? item.baseForm : item.lemma])
  const translation = song.lineTranslations?.find((t) => t.lineIndex === lineIdx)?.textIt

  const startEdit = () => { setMeaning(item.meaningIt); setExplanation(item.explanationIt); setMode('edit') }
  const save = async () => {
    try {
      await (table as typeof db.chunks).update(item.id, { meaningIt: meaning.trim(), explanationIt: explanation.trim(), userEdited: true })
      setMode('view')
    } catch (e) {
      reportError(e)
    }
  }
  const suspend = async () => {
    try { await (table as typeof db.chunks).update(item.id, { suspended: true }) } catch (e) { reportError(e) }
  }
  const exclude = async () => {
    try {
      await db.transaction('rw', db.chunks, db.words, db.cards, async () => {
        await db.cards.where('itemId').equals(item.id).delete()
        await table.delete(item.id)
      })
      close()
    } catch (e) {
      reportError(e)
      setMode('view')
    }
  }

  const label = kind === 'chunk' ? 'Scheda del chunk' : 'Scheda della parola'
  return (
    <div class={closing ? 'sheet-scrim closing' : 'sheet-scrim'} onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <button type="button" class="icon-btn sheet-close" aria-label="Chiudi" onClick={close}><Icon name="close" /></button>
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
              <button type="submit" class="btn primary">Salva</button>
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
              <p><Highlighted line={line} spans={[{ text: surface, id: item.id, className: 'w' }]} /></p>
            </div>
          )}
          {item.extraExampleEn && (
            <div>
              <div class="section-label">NEL PARLATO</div>
              <p lang="en">{item.extraExampleEn}</p>
            </div>
          )}
          {kind === 'chunk' && item.pronunciationNoteIt && (
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

        {mode === 'confirm' ? (
          <div class="confirm" role="alert">
            <p>Togliere questo elemento e le sue card? Se compare in una canzone nuova, ti verrà proposto di nuovo.</p>
            <div class="grid2">
              <button type="button" class="btn outline danger" onClick={() => void exclude()}>Sì, escludi</button>
              <button type="button" class="btn outline" onClick={() => setMode('view')}>Annulla</button>
            </div>
          </div>
        ) : (
          mode === 'view' && (
            <div class="grid3">
              <button type="button" class="btn outline" onClick={startEdit}>Modifica</button>
              <button type="button" class="btn outline" disabled={item.suspended} onClick={() => void suspend()}>
                {item.suspended ? 'Sospesa' : 'Sospendi'}
              </button>
              <button type="button" class="btn outline danger" onClick={() => setMode('confirm')}>Escludi</button>
            </div>
          )
        )}
      </section>
    </div>
  )
}
