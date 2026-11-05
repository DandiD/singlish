import { State } from 'ts-fsrs'
import type { SinglishDB } from '../db/db'
import type { Chunk, Song, Word } from '../db/types'

export type LineUnlock = { lineIndex: number; itemIds: string[]; unlocked: boolean }

export const lineKey = (songId: string, lineIndex: number) => `${songId}:${lineIndex}`

/**
 * Un verso è sbloccato quando tutte le sue voci hanno la card R in Review.
 * Dopo un Again la card passa a Relearning, quindi «ultimo voto ≠ Again» è implicito nello stato.
 * Le voci di un verso vengono dai `contexts` (non dagli highlight): chunk non sospesi e parole `learn` non sospese.
 */
export function unlockedLines(
  song: Song,
  chunks: Chunk[],
  words: Word[],
  rState: Map<string, State>,
): { lines: LineUnlock[]; unlocked: number; total: number } {
  const byLine = new Map<number, string[]>()
  const add = (id: string, contexts: { songId: string; lineIndex: number }[]) => {
    for (const cx of contexts) {
      if (cx.songId !== song.id) continue
      if (!Number.isInteger(cx.lineIndex) || cx.lineIndex < 0 || cx.lineIndex >= song.lines.length) continue
      const ids = byLine.get(cx.lineIndex) ?? []
      if (!ids.includes(id)) ids.push(id)
      byLine.set(cx.lineIndex, ids)
    }
  }
  for (const c of chunks) if (!c.suspended) add(c.id, c.contexts)
  for (const w of words) if (!w.suspended && w.triage === 'learn') add(w.id, w.contexts)

  const lines = [...byLine.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lineIndex, itemIds]) => ({
      lineIndex,
      itemIds,
      unlocked: itemIds.every((id) => rState.get(id) === State.Review),
    }))
  return { lines, unlocked: lines.filter((l) => l.unlocked).length, total: lines.length }
}

/** Stato FSRS della card R di ogni voce (id della voce → stato). */
export async function rCardStates(db: SinglishDB): Promise<Map<string, State>> {
  const cards = await db.cards.where('kind').equals('R').toArray()
  return new Map(cards.map((c) => [c.itemId, c.fsrs.state]))
}
