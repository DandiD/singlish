import type { Rating } from '../db/types'

export type SegmentKind = 'full' | 'half' | 'empty' | 'written' | 'done' | 'todo'
export type Outcome = { kind: 'rated'; rating: Rating } | { kind: 'written' }

export function segmentOf(rating: Rating): 'full' | 'half' | 'empty' {
  return rating >= 3 ? 'full' : rating === 2 ? 'half' : 'empty'
}

/** Una voce per card: già fatte prima, esiti di questa visita, poi da fare fino a `total`. */
export function sessionSegments(input: { doneBefore: number; outcomes: Outcome[]; total: number }): SegmentKind[] {
  const out: SegmentKind[] = []
  for (let i = 0; i < input.doneBefore; i++) out.push('done')
  for (const o of input.outcomes) out.push(o.kind === 'written' ? 'written' : segmentOf(o.rating))
  while (out.length < input.total) out.push('todo')
  return out.slice(0, Math.max(input.total, 0))
}

/** Indici (negli esiti) che brillano: la 5ª risposta consecutiva diversa da «Di nuovo»; le scritte non contano né interrompono. */
export function streakGlowAt(outcomes: Outcome[]): number[] {
  const glow: number[] = []
  let run = 0
  outcomes.forEach((o, i) => {
    if (o.kind !== 'rated') return
    if (o.rating === 1) run = 0
    else if (++run === 5) glow.push(i)
  })
  return glow
}

export function segmentsLabel(outcomes: Outcome[]): string {
  let good = 0, hard = 0, again = 0
  for (const o of outcomes) {
    if (o.kind !== 'rated') continue
    if (o.rating >= 3) good++
    else if (o.rating === 2) hard++
    else again++
  }
  const parts = [
    good && `${good} Bene o Facile`,
    hard && `${hard} Difficile`,
    again && `${again} Di nuovo`,
  ].filter(Boolean)
  return parts.length ? `Voti finora: ${parts.join(', ')}` : 'Nessun voto finora'
}
