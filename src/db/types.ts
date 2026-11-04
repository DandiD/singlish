import type { Card } from 'ts-fsrs'

export type Level = 'B1' | 'B2' | 'C1'
export type Register = 'usable' | 'informal' | 'song_only'
export type ChunkType = 'phrasal_verb' | 'idiom' | 'collocation' | 'fixed_phrase' | 'slang'
export type Rating = 1 | 2 | 3 | 4
/** Un verso in cui compare la voce. `surfaceForm` c'è solo se lì la voce ha una forma diversa da `surfaceForm` della voce. */
export type TextSource = 'serie' | 'podcast' | 'articolo' | 'altro'
export type Context = { songId: string; lineIndex: number; surfaceForm?: string }

export interface Song {
  id: string
  /** Canzone, o testo libero (serie, podcast, articolo…): stessa analisi, senza parlato connesso né riascolto. */
  kind: 'song' | 'text'
  source?: TextSource
  title: string
  artist: string
  spotifyUrl: string | null
  lines: string[]
  status: 'draft' | 'queued' | 'analyzed' | 'studying' | 'done'
  level: Level
  difficultyKnownPct: number | null
  comprehensionBefore: number | null
  grammarPoint: { title: string; explanationIt: string; lineIndex: number } | null
  connectedSpeech: { lineIndex: number; written: string; sung: string; noteIt: string }[]
  /** Traduzione italiana dei versi con un elemento da studiare. Assente nelle canzoni analizzate prima. */
  lineTranslations?: { lineIndex: number; textIt: string }[]
  addedAt: Date
  analyzedAt: Date | null
  /** Quando la canzone è passata «in studio» (aperto lo Studio). Assente nelle canzoni di prima: vale `analyzedAt`. */
  studyStartedAt?: Date | null
  /** Riascolto finale: % capita dopo lo studio, e quando. */
  comprehensionAfter?: number | null
  finalListenAt?: Date | null
}

export interface Chunk {
  id: string
  songId: string
  key: string
  baseForm: string
  surfaceForm: string
  lineIndex: number
  contexts: Context[]
  type: ChunkType
  cefr: string
  register: Register
  topic: string
  meaningIt: string
  explanationIt: string
  extraExampleEn: string
  productionPromptIt: string
  pronunciationNoteIt: string
  userEdited: boolean
  suspended: boolean
}

export interface Word {
  id: string
  lemma: string
  surfaceForm: string
  pos: string
  freqRank: number
  songId: string
  lineIndex: number
  contexts: Context[]
  cefr: string
  register: Register
  topic: string
  meaningIt: string
  explanationIt: string
  extraExampleEn: string
  triage: 'pending' | 'known' | 'learn'
  userEdited: boolean
  suspended: boolean
}

export interface CardRow {
  id: string
  itemType: 'chunk' | 'word'
  itemId: string
  kind: 'R' | 'C'
  unlocked: 0 | 1
  due: Date
  fsrs: Card
  goodRCount: number
}

export interface Review {
  id: string
  cardId: string
  rating: Rating
  auto: boolean
  answer: string | null
  elapsedMs: number
  reviewedAt: Date
  wasNew: boolean
}

export interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'stopped'
  durationMs: number
  accumulatedMs: number
  resumedAt: number | null
}

export interface SessionRow {
  id: string
  kind: 'study' | 'review'
  songId: string | null
  startedAt: Date
  endedAt: Date | null
  timer: TimerState
  reviewsDone: number
  newDone: number
}

export interface Settings {
  id: 'settings'
  apiKey: string
  model: string
  theme: 'auto' | 'light' | 'dark'
  level: Level
  bandStart: number
  bandEnd: number
  desiredRetention: number
  newPerDay: number
  timerMinutes: { study: number; review: number }
  persistAsked: boolean
}
