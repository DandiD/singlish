import { State } from 'ts-fsrs'
import { TYPE_ORDER } from './legend'
import type { CardRow, Chunk, Song, Word } from '../db/types'

export type LexStatus = 'nuovo' | 'impara' | 'attivo' | 'sospeso' | 'da smistare'

export interface LexEntry {
  id: string
  kind: 'chunk' | 'word'
  title: string
  meaning: string
  type: Chunk['type'] | 'word'
  cefr: string
  register: Chunk['register']
  topic: string
  status: LexStatus
  /** Titolo della canzone, o «N canzoni» se compare in più canzoni. */
  where: string
  /** Canzone e voce da aprire per vederne la scheda. */
  songId: string
}

export type LexChip = 'tutti' | 'B1' | 'B2' | 'C1' | 'attivi' | 'solo canzone' | 'parole'
export interface LexFilter { q?: string; chip?: LexChip; topic?: string; type?: LexEntry['type'] }

export const TOPICS: Record<string, string> = {
  emotions: 'Emozioni', relationships: 'Relazioni', work: 'Lavoro', travel: 'Viaggi', money: 'Soldi',
  health: 'Salute', leisure: 'Tempo libero', time: 'Tempo', other: 'Altro',
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase()

function statusOf(item: Chunk | Word, cards: CardRow[]): LexStatus {
  if (item.suspended) return 'sospeso'
  if ('triage' in item && item.triage === 'pending') return 'da smistare'
  const r = cards.find((c) => c.kind === 'R')
  const c = cards.find((c) => c.kind === 'C')
  if (c && c.unlocked === 1 && c.fsrs.state === State.Review) return 'attivo'
  if (!r || r.fsrs.state === State.New) return 'nuovo'
  return 'impara'
}

/** Tutte le voci del lessico (chunk e parole non note), filtrate e ordinate: prima i chunk, poi le parole. */
export function lexicon(data: { songs: Song[]; chunks: Chunk[]; words: Word[]; cards: CardRow[] }, f: LexFilter): LexEntry[] {
  const title = new Map(data.songs.map((s) => [s.id, s.title]))
  const isText = new Set(data.songs.filter((s) => s.kind === 'text').map((s) => s.id))
  const cardsOf = new Map<string, CardRow[]>()
  for (const c of data.cards) cardsOf.set(c.itemId, [...(cardsOf.get(c.itemId) ?? []), c])
  const entry = (item: Chunk | Word, kind: 'chunk' | 'word'): LexEntry => {
    const songIds = [...new Set(item.contexts.map((x) => x.songId).filter((id) => title.has(id)))]
    return {
      id: item.id, kind,
      title: kind === 'chunk' ? (item as Chunk).baseForm : (item as Word).lemma,
      meaning: item.meaningIt, type: kind === 'chunk' ? (item as Chunk).type : 'word',
      cefr: item.cefr, register: item.register, topic: item.topic,
      status: statusOf(item, cardsOf.get(item.id) ?? []),
      // Più posti: si dice se sono canzoni, testi o tutti e due.
      where: songIds.length > 1 ? `${songIds.length} ${songIds.every((id) => isText.has(id)) ? 'testi' : songIds.some((id) => isText.has(id)) ? 'tra canzoni e testi' : 'canzoni'}` : title.get(songIds[0] ?? item.songId) ?? '',
      songId: title.has(item.songId) ? item.songId : songIds[0] ?? item.songId,
    }
  }
  const byTitle = (a: LexEntry, b: LexEntry) => a.title.localeCompare(b.title, 'en')
  const all = [
    ...data.chunks.map((c) => entry(c, 'chunk')).sort(byTitle),
    ...data.words.filter((w) => w.triage !== 'known').map((w) => entry(w, 'word')).sort(byTitle),
  ]
  const q = fold(f.q ?? '').trim()
  return all.filter((e) => {
    if (q && !fold(`${e.title} ${e.meaning}`).includes(q)) return false
    if (f.topic && e.topic !== f.topic) return false
    if (f.type && e.type !== f.type) return false
    switch (f.chip ?? 'tutti') {
      case 'B1': case 'B2': case 'C1': return e.cefr === f.chip
      case 'attivi': return e.status === 'attivo'
      case 'solo canzone': return e.register === 'song_only'
      case 'parole': return e.kind === 'word'
      default: return true
    }
  })
}

/** Quante voci in studio (non sospese, non da smistare) per tema, dal tema meno coperto al più coperto. */
export function coverage(entries: LexEntry[]): { topic: string; label: string; count: number }[] {
  const counted = entries.filter((e) => e.status !== 'sospeso' && e.status !== 'da smistare')
  return Object.entries(TOPICS)
    .map(([topic, label]) => ({ topic, label, count: counted.filter((e) => e.topic === topic).length }))
    .sort((a, b) => a.count - b.count || a.label.localeCompare(b.label, 'it'))
}

/** Quante voci per tipo, in ordine fisso; i tipi senza voci hanno 0. */
export function composition(entries: LexEntry[]): { type: LexEntry['type']; label: string; count: number }[] {
  return TYPE_ORDER.map(({ type, label }) => ({ type, label, count: entries.filter((e) => e.type === type).length }))
}

/** Tacche accese (0–3): quanto la voce è consolidata. */
export function strength(status: LexStatus): 0 | 1 | 2 | 3 {
  return status === 'attivo' ? 3 : status === 'impara' ? 2 : status === 'nuovo' ? 1 : 0
}
