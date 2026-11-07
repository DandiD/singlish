import type { Card } from 'ts-fsrs'

export type Level = 'B1' | 'B2' | 'C1'
export type Register = 'usable' | 'informal' | 'song_only'
export type ChunkType = 'phrasal_verb' | 'idiom' | 'collocation' | 'fixed_phrase' | 'slang'
export type Rating = 1 | 2 | 3 | 4
/** Un verso in cui compare la voce. `surfaceForm` c'è solo se lì la voce ha una forma diversa da `surfaceForm` della voce. */
export type TextSource = 'serie' | 'podcast' | 'articolo' | 'altro'
export type Context = { songId: string; lineIndex: number; surfaceForm?: string }

export type LineNote = { lineIndex: number; senseIt: string; grammarIt: string | null; cultureIt: string | null }
export type AskDraft = {
  answers: import('../domain/askRequest').AskAnswer[]
  unanswered: import('../domain/askSelection').AskRequest[]
}

export interface Song {
  id: string
  /** Canzone, o testo libero (serie, podcast, articolo…): stessa analisi, senza parlato connesso né riascolto. */
  kind: 'song' | 'text'
  source?: TextSource
  title: string
  artist: string
  spotifyUrl: string | null
  /** Copertina dall'oEmbed di Spotify; assente = da cercare, null = nessuna. */
  coverUrl?: string | null
  lines: string[]
  status: 'draft' | 'queued' | 'analyzed' | 'studying' | 'done'
  level: Level
  difficultyKnownPct: number | null
  comprehensionBefore: number | null
  grammarPoint: { title: string; explanationIt: string; lineIndex: number } | null
  connectedSpeech: { lineIndex: number; written: string; sung: string; noteIt: string }[]
  /** Traduzione italiana dei versi con un elemento da studiare. Assente nelle canzoni analizzate prima. */
  lineTranslations?: { lineIndex: number; textIt: string }[]
  /** Note dei versi chiesti interi a Gemini. */
  lineNotes?: LineNote[]
  /** Risposte di «Chiedi a Gemini» in attesa della scelta dello studente. */
  askDraft?: AskDraft
  addedAt: Date
  analyzedAt: Date | null
  /** Quando la canzone è passata «in studio» (aperto lo Studio). Assente nelle canzoni di prima: vale `analyzedAt`. */
  studyStartedAt?: Date | null
  /** Riascolto finale: % capita dopo lo studio, e quando. */
  comprehensionAfter?: number | null
  finalListenAt?: Date | null
  /** Ritornello a voce: quando l'ha cantato senza testo. */
  chorusDoneAt?: Date | null
  /** Lettura riga per riga: quando è arrivato in fondo. */
  readAlongAt?: Date | null
  /** Indici dei versi sbloccati già mostrati nello Studio: quelli nuovi si accendono all'apertura. */
  unlockedSeen?: number[]
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
  /** Aggiunta da Espandi: senza verso, con l'esempio di Gemini; in coda dopo le voci delle canzoni. */
  origin?: 'expand'
  /** Per le voci di Espandi: la parola da cui sono nate (restano finché esiste lei). */
  fromItemId?: string
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
  origin?: 'expand'
  fromItemId?: string
  /** Era nota prima di passare in studio: eliminata la sua canzone, torna nel profilo anche se mai ripassata. */
  wasKnown?: boolean
  /** Risultato di Espandi (una chiamata, poi salvato). */
  expansion?: import('../domain/expand').Expansion
  /** Card Sfumature: scelta fra parole vicine in una situazione. */
  nuance?: import('../domain/expand').Nuance
}

export interface CardRow {
  id: string
  itemType: 'chunk' | 'word'
  itemId: string
  /** R Riconosci, C Completa, P Produci e A Ascolta (chunk, dopo la C in ripasso), S Sfumature (parole, da Espandi). */
  kind: 'R' | 'C' | 'P' | 'A' | 'S'
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
  /** Stabilità FSRS della card prima e dopo il ripasso (assente nei ripassi di prima). */
  stability?: { before: number; after: number }
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
  /** Frasi scritte nelle card Produci, da correggere con Gemini a fine sessione (tutte in una chiamata). */
  productions?: Production[]
  /** Versi sbloccati all'apertura della sessione (`songId:lineIndex`); assente nelle sessioni di prima. */
  unlockedAtStart?: string[]
}

export interface Production {
  cardId: string
  itemId: string
  sentence: string
  elapsedMs: number
  /** La card era nuova: la frase conta fra le nuove del giorno in cui è stata scritta. */
  wasNew?: boolean
  at?: Date
}

export interface Settings {
  id: 'settings'
  apiKey: string
  model: string
  theme: 'auto' | 'light' | 'dark'
  level: Level
  bandStart: number
  bandEnd: number
  /** La fascia viene dal test di vocabolario (non dal livello). */
  bandFromTest?: boolean
  desiredRetention: number
  newPerDay: number
  timerMinutes: { study: number; review: number }
  persistAsked: boolean
  /** Vibrazione breve su risposta esatta e chiusura dell'anello; assente = attiva. */
  haptics?: boolean
  /** Il banner «Installa» di Oggi è stato chiuso: non ricompare (l'installazione resta nelle Impostazioni). */
  installBannerDismissed?: boolean
  /** Modalità intensiva: fino a questa data le card nuove al giorno salgono a 25. */
  intensiveUntil?: Date | null
  /** Test di vocabolario fatti, dal più vecchio. */
  vocabTests?: { at: Date; estimate: number; falseAlarms: number }[]
  /** Giorni di ripasso a settimana (3–7); assente = 5. */
  rhythmGoal?: number
  /** Giorni `YYYY-MM-DD` aperti senza card in coda: contano come attivi. Ultimi 84. */
  freeDays?: string[]
  /** Traguardi già mostrati: id → data. Assente = mai seminato (prima apertura); `{}` = seminato, nessuno visto. */
  milestonesSeen?: Record<string, Date>
}
