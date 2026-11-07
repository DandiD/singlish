import { useEffect } from 'preact/hooks'
import { Icon } from '../components/Icon'
import { useSheet } from './ItemSheet'
import type { Song } from '../../db/types'

/** Le note di un verso chiesto intero a Gemini: traduzione, senso, grammatica, cultura. */
export function VerseSheet({ song, itemId }: { song: Song; itemId: string }) {
  const i = Number(itemId.slice(3))
  const note = song.lineNotes?.find((n) => n.lineIndex === i)
  const line = song.lines[i]
  const translation = song.lineTranslations?.find((t) => t.lineIndex === i)?.textIt
  const ok = !!note && line !== undefined
  const { ref, closing, close } = useSheet(song.id, itemId, ok)
  useEffect(() => { if (!ok) void close() }, [ok])
  if (!note || line === undefined) return null
  return (
    <div class={closing ? 'sheet-scrim closing' : 'sheet-scrim'} onClick={(e) => { if (e.target === e.currentTarget) void close() }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={`Note sul verso ${i + 1}`} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <button type="button" class="icon-btn sheet-close" aria-label="Chiudi" onClick={() => void close()}><Icon name="close" /></button>
        <h2 class="sheet-title" lang="en">{line}</h2>
        {translation && <p class="sheet-meaning">{translation}</p>}
        <div class="examples">
          <div><div class="section-label">Senso</div><p>{note.senseIt}</p></div>
          {note.grammarIt && <div><div class="section-label">Grammatica</div><p>{note.grammarIt}</p></div>}
          {note.cultureIt && <div><div class="section-label">Cultura</div><p>{note.cultureIt}</p></div>}
        </div>
      </section>
    </div>
  )
}
