import { State } from 'ts-fsrs'
import type { SinglishDB } from '../db/db'
import type { Chunk, Song, Word } from '../db/types'
import { itemsInSong, type Span } from './songItems'

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

/** Raggruppa le voci per canzone dai `contexts` (una volta sola, O(voci)). */
export function groupBySong(chunks: Chunk[], words: Word[]): Map<string, { chunks: Chunk[]; words: Word[] }> {
  const out = new Map<string, { chunks: Chunk[]; words: Word[] }>()
  const slot = (songId: string) => {
    let g = out.get(songId)
    if (!g) out.set(songId, (g = { chunks: [], words: [] }))
    return g
  }
  for (const c of chunks) for (const id of new Set(c.contexts.map((x) => x.songId))) slot(id).chunks.push(c)
  for (const w of words) for (const id of new Set(w.contexts.map((x) => x.songId))) slot(id).words.push(w)
  return out
}

/** `unlockedLines` per ciascuna canzone, sulle sole voci di quella canzone. */
export function unlockedBySong(
  songs: Song[], chunks: Chunk[], words: Word[], rState: Map<string, State>,
): Map<string, ReturnType<typeof unlockedLines>> {
  const groups = groupBySong(chunks, words)
  return new Map(songs.map((s) => {
    const g = groups.get(s.id)
    return [s.id, unlockedLines(s, g?.chunks ?? [], g?.words ?? [], rState)]
  }))
}

/** Stato FSRS della card R di ogni voce (id della voce → stato). */
export async function rCardStates(db: SinglishDB): Promise<Map<string, State>> {
  const cards = await db.cards.where('kind').equals('R').toArray()
  return new Map(cards.map((c) => [c.itemId, c.fsrs.state]))
}

const ACTIVE = new Set<Song['status']>(['studying', 'done'])

async function currentUnlocked(db: SinglishDB): Promise<{ song: Song; lineIndex: number }[]> {
  const [songs, chunks, words, rState] = await Promise.all([
    db.songs.toArray(), db.chunks.toArray(), db.words.toArray(), rCardStates(db),
  ])
  const out: { song: Song; lineIndex: number }[] = []
  const active = songs.filter((s) => ACTIVE.has(s.status)).sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
  const per = unlockedBySong(active, chunks, words, rState)
  for (const song of active) {
    for (const l of per.get(song.id)!.lines) if (l.unlocked) out.push({ song, lineIndex: l.lineIndex })
  }
  return out
}

/** `lineKey` di tutti i versi sbloccati delle canzoni in studio o finite. */
export async function unlockedKeys(db: SinglishDB): Promise<string[]> {
  return (await currentUnlocked(db)).map((u) => lineKey(u.song.id, u.lineIndex))
}

export type UnlockedVerse = { song: Song; lineIndex: number; line: string; spans: Span[]; translation: string | null }

/** I versi sbloccati ora che non erano in `before`, per canzone (addedAt) e poi per verso. */
export async function newlyUnlocked(db: SinglishDB, before: string[]): Promise<UnlockedVerse[]> {
  const seen = new Set(before)
  const fresh = (await currentUnlocked(db)).filter((u) => !seen.has(lineKey(u.song.id, u.lineIndex)))
  if (!fresh.length) return []
  const [chunks, words] = await Promise.all([db.chunks.toArray(), db.words.toArray()])
  const groups = groupBySong(chunks, words)
  const spansBySong = new Map<string, Span[][]>()
  return fresh.map(({ song, lineIndex }) => {
    let all = spansBySong.get(song.id)
    if (!all) {
      const g = groups.get(song.id)
      spansBySong.set(song.id, (all = itemsInSong(song, g?.chunks ?? [], g?.words ?? []).spansByLine))
    }
    return {
      song,
      lineIndex,
      line: song.lines[lineIndex],
      spans: (all[lineIndex] ?? []).filter((s) => !s.id.startsWith('cs:')),
      translation: song.lineTranslations?.find((t) => t.lineIndex === lineIndex)?.textIt ?? null,
    }
  })
}

export type StrongItem = { itemId: string; text: string; meaningIt: string; song: Song | null; growth: number }

/** Le voci con la crescita di stabilità maggiore dai ripassi (non «Di nuovo») fatti da `since` in poi. */
export async function strongestSince(db: SinglishDB, since: Date, limit = 3): Promise<StrongItem[]> {
  const reviews = await db.reviews.where('reviewedAt').aboveOrEqual(since).toArray()
  const cardIds = [...new Set(reviews.map((r) => r.cardId))]
  const cards = new Map((await db.cards.bulkGet(cardIds)).filter((c) => !!c).map((c) => [c!.id, c!]))
  const growth = new Map<string, number>()
  for (const r of reviews) {
    if (r.rating === 1 || !r.stability) continue
    const card = cards.get(r.cardId)
    if (!card) continue
    growth.set(card.itemId, (growth.get(card.itemId) ?? 0) + (r.stability.after - r.stability.before))
  }
  const ids = [...growth].filter(([, g]) => g > 0).map(([id]) => id)
  const chunkRows = await db.chunks.bulkGet(ids)
  const wordRows = await db.words.bulkGet(ids)
  const items = ids.map((id, i) => ({ id, chunk: chunkRows[i], word: chunkRows[i] ? undefined : wordRows[i] }))
  const songIds = [...new Set(items.map((x) => (x.chunk ?? x.word)?.songId).filter((x): x is string => !!x))]
  const songRows = new Map((await db.songs.bulkGet(songIds)).filter((x) => !!x).map((x) => [x!.id, x!]))
  const out: StrongItem[] = []
  for (const { id: itemId, chunk, word } of items) {
    const item = chunk ?? word
    if (!item) continue
    out.push({
      itemId,
      text: chunk ? chunk.baseForm : word!.lemma,
      meaningIt: item.meaningIt,
      song: songRows.get(item.songId) ?? null,
      growth: growth.get(itemId)!,
    })
  }
  return out.sort((a, b) => b.growth - a.growth || a.text.localeCompare(b.text)).slice(0, limit)
}
