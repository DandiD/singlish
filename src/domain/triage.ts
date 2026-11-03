import type { SinglishDB } from '../db/db'
import type { Word } from '../db/types'
import { newCardPair } from './scheduler'

/**
 * Le parole da smistare di una canzone: quelle ancora `pending` che compaiono in un suo verso (anche se nate in
 * un'altra canzone), non sospese, nell'ordine dei versi. Banner dello Studio, Smista e Analisi contano queste.
 */
export async function pendingWords(db: SinglishDB, songId: string): Promise<Word[]> {
  const lineHere = (w: Word) => w.contexts.find((x) => x.songId === songId)?.lineIndex ?? (w.songId === songId ? w.lineIndex : -1)
  const words = await db.words.where('triage').equals('pending').filter((w) => !w.suspended && lineHere(w) >= 0).toArray()
  return words.sort((a, b) => lineHere(a) - lineHere(b))
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
