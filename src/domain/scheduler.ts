import { createEmptyCard, type Card } from 'ts-fsrs'
import type { CardRow } from '../db/types'

export function newFsrsCard(now: Date): Card {
  return createEmptyCard(now)
}

export function newCardPair(itemType: CardRow['itemType'], itemId: string, now: Date): CardRow[] {
  return (['R', 'C'] as const).map((kind) => ({
    id: crypto.randomUUID(),
    itemType,
    itemId,
    kind,
    unlocked: kind === 'R' ? (1 as const) : (0 as const),
    due: now,
    fsrs: newFsrsCard(now),
    goodRCount: 0,
  }))
}
