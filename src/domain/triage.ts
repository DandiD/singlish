import type { SinglishDB } from '../db/db'
import type { Word } from '../db/types'
import { newCardPair } from './scheduler'

export async function pendingWords(db: SinglishDB, songId: string): Promise<Word[]> {
  const words = await db.words.where('songId').equals(songId).filter((w) => w.triage === 'pending').toArray()
  return words.sort((a, b) => a.lineIndex - b.lineIndex)
}

export async function applyTriage(
  db: SinglishDB,
  decisions: Record<string, 'known' | 'learn'>,
  now: Date,
): Promise<{ known: number; learn: number }> {
  return db.transaction('rw', db.words, db.cards, async () => {
    const result = { known: 0, learn: 0 }
    for (const [id, decision] of Object.entries(decisions)) {
      const word = await db.words.get(id)
      if (!word || word.triage !== 'pending') continue
      await db.words.update(id, { triage: decision })
      if (decision === 'learn') await db.cards.bulkAdd(newCardPair('word', id, now))
      result[decision]++
    }
    return result
  })
}
