import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs'
import type { SinglishDB } from '../db/db'
import type { CardRow, Rating as RatingValue } from '../db/types'
import { newId } from './id'

export function newFsrsCard(now: Date): Card {
  return createEmptyCard(now)
}

export function newCardPair(itemType: CardRow['itemType'], itemId: string, now: Date): CardRow[] {
  return (['R', 'C'] as const).map((kind) => ({
    id: newId(),
    itemType,
    itemId,
    kind,
    unlocked: kind === 'R' ? (1 as const) : (0 as const),
    due: now,
    fsrs: newFsrsCard(now),
    goodRCount: 0,
  }))
}

const RATING_MAP = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy } as const

export function createScheduler(desiredRetention: number) {
  return fsrs(generatorParameters({ request_retention: desiredRetention, enable_fuzz: false }))
}

export async function recordReview(
  db: SinglishDB,
  cardId: string,
  input: { rating: RatingValue; auto: boolean; answer: string | null; elapsedMs: number },
  now: Date,
  desiredRetention: number,
): Promise<CardRow> {
  return db.transaction('rw', db.cards, db.reviews, db.chunks, db.songs, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`Card not found: ${cardId}`)
    const result = createScheduler(desiredRetention).next(card.fsrs, now, RATING_MAP[input.rating])
    const goodRCount =
      card.kind === 'R' && input.rating !== 1 ? card.goodRCount + 1 : card.goodRCount
    const updated: CardRow = { ...card, fsrs: result.card, due: result.card.due, goodRCount }
    await db.cards.put(updated)
    await db.reviews.add({
      id: newId(),
      cardId,
      rating: input.rating,
      auto: input.auto,
      answer: input.answer,
      elapsedMs: input.elapsedMs,
      reviewedAt: now,
      wasNew: card.fsrs.state === State.New,
    })
    // La Completa di un chunk in ripasso sblocca la Produci e l'Ascolta (create ora: i chunk di prima non le hanno).
    if (card.kind === 'C' && card.itemType === 'chunk' && input.rating !== 1 && result.card.state === State.Review) {
      const kinds = new Set((await db.cards.where('itemId').equals(card.itemId).toArray()).map((c) => c.kind))
      const chunk = await db.chunks.get(card.itemId)
      const add = (kind: 'P' | 'A') =>
        db.cards.add({ id: newId(), itemType: 'chunk', itemId: card.itemId, kind, unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
      if (chunk && !kinds.has('P') && chunk.productionPromptIt.trim()) await add('P')
      // La card Ascolta solo dove l'ascolto aggiunge qualcosa: nota di pronuncia o parlato connesso nel verso.
      if (chunk && !kinds.has('A') && chunk.origin !== 'expand') {
        const song = await db.songs.get(chunk.songId)
        const sung = song?.connectedSpeech.some((cs) => cs.lineIndex === chunk.lineIndex) ?? false
        if (chunk.pronunciationNoteIt.trim() || sung) await add('A')
      }
    }
    if (card.kind === 'R' && goodRCount >= 2) {
      const sibling = await db.cards
        .where('itemId')
        .equals(card.itemId)
        .filter((c) => c.kind === 'C' && c.itemType === card.itemType)
        .first()
      if (sibling && sibling.unlocked === 0) {
        await db.cards.update(sibling.id, { unlocked: 1, due: now })
      }
    }
    return updated
  })
}
