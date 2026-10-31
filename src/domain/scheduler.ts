import { createEmptyCard, type Card } from 'ts-fsrs'

export function newFsrsCard(now: Date): Card {
  return createEmptyCard(now)
}
