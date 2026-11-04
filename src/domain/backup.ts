import type { SinglishDB } from '../db/db'
import type { CardRow, Chunk, Review, SessionRow, Settings, Song, Word } from '../db/types'
import { DEFAULT_SETTINGS, getSettings } from './settings'
import { repairHomes } from './ingest'

export type BackupFile = {
  app: 'singlish'
  version: 1
  exportedAt: string
  tables: {
    songs: Song[]
    chunks: Chunk[]
    words: Word[]
    cards: CardRow[]
    reviews: Review[]
    sessions: SessionRow[]
    settings: Omit<Settings, 'apiKey'>[]
  }
}

const TABLE_NAMES = ['songs', 'chunks', 'words', 'cards', 'reviews', 'sessions', 'settings'] as const

export async function exportBackup(db: SinglishDB, now: Date): Promise<BackupFile> {
  const [songs, chunks, words, cards, reviews, sessions, settings] = await Promise.all([
    db.songs.toArray(),
    db.chunks.toArray(),
    db.words.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.sessions.toArray(),
    db.settings.toArray(),
  ])
  return {
    app: 'singlish',
    version: 1,
    exportedAt: now.toISOString(),
    tables: {
      songs,
      chunks,
      words,
      cards,
      reviews,
      sessions,
      settings: settings.map(({ apiKey: _apiKey, ...rest }) => rest),
    },
  }
}

// Revives an ISO string (or leaves null/undefined/Date untouched).
function d<T extends string | Date | null | undefined>(v: T): T extends null | undefined ? T : Date
function d(v: unknown): unknown {
  return typeof v === 'string' ? new Date(v) : v
}

export function isBackup(file: unknown): file is BackupFile {
  if (typeof file !== 'object' || file === null) return false
  const f = file as Record<string, unknown>
  if (f.app !== 'singlish' || f.version !== 1) return false
  const t = f.tables
  if (typeof t !== 'object' || t === null) return false
  return TABLE_NAMES.every((n) => Array.isArray((t as Record<string, unknown>)[n]))
}

export async function importBackup(db: SinglishDB, file: unknown): Promise<void> {
  if (!isBackup(file)) throw new Error('Backup non valido')
  const t = file.tables
  const { apiKey } = await getSettings(db)

  const songs = t.songs.map((s) => ({
    ...s, addedAt: d(s.addedAt), analyzedAt: d(s.analyzedAt),
    studyStartedAt: d(s.studyStartedAt ?? null), finalListenAt: d(s.finalListenAt ?? null), chorusDoneAt: d(s.chorusDoneAt ?? null),
  }))
  const cards = t.cards.map((c) => ({
    ...c,
    due: d(c.due),
    fsrs: { ...c.fsrs, due: d(c.fsrs.due), last_review: d(c.fsrs.last_review) },
  }))
  const reviews = t.reviews.map((r) => ({ ...r, reviewedAt: d(r.reviewedAt) }))
  const sessions = t.sessions.map((s) => ({
    ...s, startedAt: d(s.startedAt), endedAt: d(s.endedAt),
    ...(s.productions ? { productions: s.productions.map((p) => ({ ...p, at: d(p.at ?? null) ?? undefined })) } : {}),
  }))
  const settingsRow: Settings = {
    ...(t.settings[0] ? { ...DEFAULT_SETTINGS, ...t.settings[0], intensiveUntil: d(t.settings[0].intensiveUntil ?? null), vocabTests: (t.settings[0].vocabTests ?? []).map((v) => ({ ...v, at: d(v.at) })) } : DEFAULT_SETTINGS),
    id: 'settings',
    apiKey,
  }

  await db.transaction(
    'rw',
    [db.songs, db.chunks, db.words, db.cards, db.reviews, db.sessions, db.settings],
    async () => {
      await Promise.all([
        db.songs.clear(),
        db.chunks.clear(),
        db.words.clear(),
        db.cards.clear(),
        db.reviews.clear(),
        db.sessions.clear(),
        db.settings.clear(),
      ])
      await db.songs.bulkAdd(songs)
      await db.chunks.bulkAdd(t.chunks)
      await db.words.bulkAdd(t.words)
      await db.cards.bulkAdd(cards)
      await db.reviews.bulkAdd(reviews)
      await db.sessions.bulkAdd(sessions)
      await db.settings.add(settingsRow)
      // Un backup di prima può avere voci fuori dai loro versi: si sistemano subito, nella stessa transazione.
      await repairHomes(db)
    },
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

export function backupFileName(exportedAt: string): string {
  const x = new Date(exportedAt)
  return `singlish-backup-${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}.json`
}

export async function downloadOrShare(file: BackupFile): Promise<void> {
  const name = backupFileName(file.exportedAt)
  const f = new File([JSON.stringify(file)], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [f] })) {
    try {
      await navigator.share({ files: [f] })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
    return
  }
  const url = URL.createObjectURL(f)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
