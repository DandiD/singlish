import type { Song } from '../db/types'
import { FINAL_LISTEN_DAYS } from './finalListen'

export type StageId = 'listen' | 'analyze' | 'study' | 'triage' | 'review' | 'final'
export type StageState = 'done' | 'partial' | 'current' | 'todo'
export type Stage = {
  id: StageId
  name: string
  state: StageState
  detail: string | null
  action: 'analyzing' | 'triage' | 'finalListen' | 'readAlong' | null
}

const DAY = 86_400_000

/** Guadagno del riascolto («+28», «-5», «0»), o null senza i due valori. */
export function gainText(song: Pick<Song, 'comprehensionBefore' | 'comprehensionAfter'>): string | null {
  if (song.comprehensionBefore == null || song.comprehensionAfter == null) return null
  const gain = song.comprehensionAfter - song.comprehensionBefore
  return gain > 0 ? `+${gain}` : `${gain}`
}

/** Giorni che mancano al riascolto: per eccesso, almeno 1 (stessa regola in millisecondi di `finalListenDue`). */
function daysLeft(song: Song, now: Date): number {
  const start = song.studyStartedAt ?? song.analyzedAt ?? song.addedAt
  const left = FINAL_LISTEN_DAYS * DAY - (now.getTime() - start.getTime())
  return Math.max(1, Math.ceil(left / DAY))
}

/** Le tappe del percorso di una canzone (o testo libero), ricavate solo da dati già salvati. */
export function songPath(input: { song: Song; toTriage: number; unlocked: number; lines: number; finalReady: boolean; now: Date }): Stage[] {
  const { song, toTriage, unlocked, lines, finalReady, now } = input
  const isText = song.kind === 'text'
  const analyzed = song.status !== 'draft' && song.status !== 'queued'

  const listen: Stage = song.comprehensionBefore != null
    ? { id: 'listen', name: isText ? 'Lettura' : 'Ascolto', state: 'done', detail: `${song.comprehensionBefore}%`, action: null }
    : { id: 'listen', name: isText ? 'Lettura' : 'Ascolto', state: 'todo', detail: null, action: null }

  const analyze: Stage = analyzed
    ? { id: 'analyze', name: 'Analisi', state: 'done', detail: null, action: null }
    : { id: 'analyze', name: 'Analisi', state: 'current', detail: null, action: 'analyzing' }

  const studied = song.status === 'studying' || song.status === 'done'
  const readDetail = song.readAlongAt
    ? `${isText ? 'letto' : 'letta'} il ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(song.readAlongAt)}`
    : null
  const study: Stage = {
    id: 'study', name: 'Studio', detail: readDetail, action: analyzed ? 'readAlong' : null,
    state: studied ? 'done' : song.status === 'analyzed' ? 'current' : 'todo',
  }

  // Prima dell'analisi le parole non esistono ancora: niente da smistare non vuol dire «fatto».
  const triage: Stage = !analyzed
    ? { id: 'triage', name: 'Smista', state: 'todo', detail: null, action: null }
    : toTriage > 0
      ? { id: 'triage', name: 'Smista', state: 'partial', detail: `${toTriage} da fare`, action: 'triage' }
      : { id: 'triage', name: 'Smista', state: 'done', detail: null, action: null }

  const review: Stage = lines === 0
    ? { id: 'review', name: 'Ripasso', state: 'todo', detail: null, action: null }
    : { id: 'review', name: 'Ripasso', state: unlocked >= lines ? 'done' : unlocked > 0 ? 'partial' : 'todo', detail: unlocked >= lines ? null : `${unlocked} di ${lines}`, action: null }

  const stages = [listen, analyze, study, triage, review]
  if (isText) return stages

  let final: Stage
  if (song.comprehensionAfter != null) {
    const detail = gainText(song) ?? `${song.comprehensionAfter}%`
    final = { id: 'final', name: 'Riascolto', state: 'done', detail, action: null }
  } else if (finalReady) {
    final = { id: 'final', name: 'Riascolto', state: 'current', detail: 'pronto', action: 'finalListen' }
  } else if (song.status === 'studying') {
    const n = daysLeft(song, now)
    final = { id: 'final', name: 'Riascolto', state: 'todo', detail: `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`, action: null }
  } else {
    final = { id: 'final', name: 'Riascolto', state: 'todo', detail: null, action: null }
  }
  return [...stages, final]
}
