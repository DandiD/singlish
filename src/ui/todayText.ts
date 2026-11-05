import type { Song } from '../db/types'
import type { Route } from '../router'
import type { dayRing, EmptyAction } from '../domain/today'

/** Una canzone aperta come la conta Oggi: voci nel ripasso (meno le parole da smistare), fatte, da smistare, sospese. */
export type SongRow = { song: Song; total: number; done: number; toTriage: number; suspended: number }
type Ring = ReturnType<typeof dayRing>

/** La frase completa di oggi per una canzone (testo accessibile della copertina). */
export function songDetail({ song, total, done, toTriage, suspended }: SongRow): string {
  if (song.status === 'draft' || song.status === 'queued') return 'Da analizzare'
  return song.status === 'analyzed'
    ? (total === 0 && toTriage > 0 ? `Da studiare · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : total === 0 ? 'Da studiare · nessuna voce da ripassare' : `Da studiare · ${total} chunk e parole${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`)
    : total === 0 && toTriage > 0 ? `${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare nello Studio`
    : total === 0 ? (suspended > 0 ? 'Nessuna voce nel ripasso: le trovi sospese nel Lessico' : 'Nessuna voce da ripassare in questa canzone')
    // Le parole lasciate da smistare si nominano anche quando la canzone ha altre voci nel ripasso.
    : `${done} di ${total} chunk e parole nel ripasso${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`
}

/** L'etichetta breve sotto la copertina. */
export function songLabel({ song, total, done, toTriage }: SongRow, finalReady: boolean): string {
  if (finalReady) return 'Riascolto pronto'
  if (song.status === 'draft' || song.status === 'queued') return 'Da analizzare'
  if (song.status === 'analyzed') return 'Da studiare'
  if (total === 0 && toTriage > 0) return `${toTriage} da smistare`
  if (total > 0) return `${done} di ${total}`
  return 'Nessuna voce'
}

export function ringLabel(ring: Ring, toCorrect: number): string {
  const left = ring.total - ring.done
  switch (ring.state) {
    case 'todo': return `${left} card da fare`
    case 'partial': return `Restano ${left} card`
    case 'done': return toCorrect === 0 ? 'Fatto per oggi' : 'Ripasso fatto · frasi da correggere'
    case 'empty': return 'Niente da ripassare oggi.'
  }
}

export function ringWhy(ring: Ring, { blocked, minutes, toCorrect }: { blocked: boolean; minutes: number; toCorrect: number }): string | null {
  if (blocked) return `Per ora niente card nuove: il ripasso in scadenza supera ${minutes === 1 ? 'il minuto' : `i ${minutes} minuti`}. Arrivano quando scende sotto.`
  if (ring.state === 'empty' && toCorrect > 0) return 'Niente da ripassare per ora: le voci con una frase da correggere tornano nel ripasso dopo la correzione.'
  return null
}

/** L'azione principale quando la coda è vuota: porta a ciò che crea card. */
export function emptyCta(action: EmptyAction): { text: string; route: Route } | null {
  switch (action.kind) {
    case 'add': return { text: 'Aggiungi una canzone', route: { name: 'addSong' } }
    case 'correct': return { text: action.count === 1 ? 'Correggi la frase con Gemini' : `Correggi le ${action.count} frasi con Gemini`, route: { name: 'feedback' } }
    case 'triage': return { text: `Smista le parole di «${action.song.title}»`, route: { name: 'triage', songId: action.song.id } }
    case 'study': return { text: `Apri lo Studio di «${action.song.title}»`, route: { name: 'study', songId: action.song.id } }
    case 'analyze': return { text: `Analizza «${action.song.title}»`, route: { name: 'analyzing', songId: action.song.id } }
    case 'none': return null
  }
}
