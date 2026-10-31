import Dexie, { type Table } from 'dexie'
import type { Chunk, CardRow, Review, SessionRow, Settings, Song, Word } from './types'

export class SinglishDB extends Dexie {
  songs!: Table<Song, string>
  chunks!: Table<Chunk, string>
  words!: Table<Word, string>
  cards!: Table<CardRow, string>
  reviews!: Table<Review, string>
  sessions!: Table<SessionRow, string>
  settings!: Table<Settings, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      songs: 'id, status, addedAt',
      chunks: 'id, songId, &key',
      words: 'id, &lemma, triage, songId',
      cards: 'id, [unlocked+due], itemId, kind',
      reviews: 'id, cardId, reviewedAt',
      sessions: 'id, startedAt',
      settings: 'id',
    })
  }
}

export function createDb(name = 'singlish'): SinglishDB {
  return new SinglishDB(name)
}

export const db = createDb()
