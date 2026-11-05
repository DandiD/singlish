import { href } from '../../router'
import type { Stage, StageState } from '../../domain/path'

/** Lo stato a parole: il pallino lo dice con la forma, il lettore di schermo con questa parola. */
const STATE_TEXT: Record<StageState, string> = { done: 'fatta', partial: 'in corso', current: 'ora', todo: 'da fare' }

/** Il percorso di una canzone (o testo): un pallino per tappa; le tappe con un'azione disponibile sono link. */
export function SongPath({ stages, songId, kind }: { stages: Stage[]; songId: string; kind: 'song' | 'text' }) {
  return (
    <ol class="song-path" aria-label="Percorso della canzone">
      {stages.map((s) => {
        const to = s.action ? href({ name: s.action, songId }) : null
        // La lettura è l'azione della tappa Studio: ha un'etichetta visibile.
        const action = s.action === 'readAlong' ? (kind === 'text' ? 'Leggi riga per riga' : 'Leggi a tempo') : null
        const detail = s.detail
        // Nome esplicito sul link: il calcolo dal contenuto metterebbe spazi fra i pezzi in alcuni browser.
        const label = `${s.name}, ${STATE_TEXT[s.state]}${detail ? `, ${detail}` : ''}${action ? `, ${action}` : ''}`
        const body = (
          <>
            <span class={`path-dot dot-${s.state}`} aria-hidden="true" />
            <span class="path-name">{s.name}</span>
            <span class="visually-hidden">{`, ${STATE_TEXT[s.state]}`}</span>
            {detail && <><span class="visually-hidden">, </span><span class="path-detail">{detail}</span></>}
            {action && <span class="path-detail path-action">{action}</span>}
          </>
        )
        return (
          <li key={s.id} class={`path-stage stage-${s.state}`}>
            {to ? <a class="path-link" href={to} aria-label={label}>{body}</a> : <span class="path-link">{body}</span>}
          </li>
        )
      })}
    </ol>
  )
}
