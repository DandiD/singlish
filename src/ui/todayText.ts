import type { Song } from '../db/types'
import type { Route } from '../router'
import type { dayRing, EmptyAction } from '../domain/today'

/** Una canzone aperta come la conta Oggi: voci (meno le parole da smistare), versi e versi sbloccati, parole da smistare, sospese. */
export type SongRow = { song: Song; items: number; lines: number; unlocked: number; toTriage: number; suspended: number }
type Ring = ReturnType<typeof dayRing>

/** «3 di 14 versi» (o «0 di 1 verso»): il nome segue il totale. */
export function linesCount(unlocked: number, lines: number): string {
  return `${unlocked} di ${lines} ${lines === 1 ? 'verso' : 'versi'}`
}

/** «3 di 14 versi sbloccati» (o «0 di 1 verso sbloccato»). */
export function unlockedText(unlocked: number, lines: number): string {
  return `${linesCount(unlocked, lines)}${lines === 1 ? ' sbloccato' : ' sbloccati'}`
}

/** La frase completa di oggi per una canzone (testo accessibile della copertina). */
export function songDetail({ song, items, lines, unlocked, toTriage, suspended }: SongRow): string {
  if (song.status === 'draft' || song.status === 'queued') return 'Da analizzare'
  return song.status === 'analyzed'
    ? (items === 0 && toTriage > 0 ? `Da studiare · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : items === 0 ? 'Da studiare · nessuna voce da ripassare' : `Da studiare · ${items} chunk e parole${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`)
    : lines === 0 && items === 0 && toTriage > 0 ? `${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare nello Studio`
    : lines === 0 ? (suspended > 0 ? 'Nessuna voce nel ripasso: le trovi sospese nel Lessico' : 'Nessuna voce da ripassare in questa canzone')
    // Le parole lasciate da smistare si nominano anche quando la canzone ha altre voci nel ripasso.
    : `${unlockedText(unlocked, lines)}${toTriage > 0 ? ` · ${toTriage === 1 ? '1 parola' : `${toTriage} parole`} da smistare` : ''}`
}

/** L'etichetta breve sotto la copertina. */
export function songLabel({ song, items, lines, unlocked, toTriage }: SongRow, finalReady: boolean): string {
  if (finalReady) return 'Riascolto pronto'
  if (song.status === 'draft' || song.status === 'queued') return 'Da analizzare'
  if (song.status === 'analyzed') return 'Da studiare'
  if (lines === 0 && items === 0 && toTriage > 0) return `${toTriage} da smistare`
  if (lines > 0) return linesCount(unlocked, lines)
  return 'Nessuna voce'
}

export function ringLabel(ring: Ring, toCorrect: number): string {
  return baseRingLabel(ring, toCorrect) + (ring.blocked ? ' · nuove in pausa' : '')
}

function baseRingLabel(ring: Ring, toCorrect: number): string {
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
