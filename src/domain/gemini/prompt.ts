import type { Level } from '../../db/types'

export const SYSTEM_PROMPT = `Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Ricevi un testo (canzone o testo libero), il livello CEFR dello studente,
la sua fascia di frequenza utile e i chunk e le parole che conosce già.
1) Estrai 8–14 chunk utili (phrasal verb, idiomi, collocazioni, frasi fatte, slang),
   privilegiando il livello dello studente e quello sopra. Escludi quelli già noti.
2) Estrai 5–8 parole singole (lemma) non comprese nei chunk, utili da imparare.
Per ogni chunk e parola: forma base, forma nel testo, indice della riga, tipo, livello,
registro (usable | informal | song_only), tema (emotions, relationships, work, travel,
money, health, leisure, time, other), significato in italiano naturale,
spiegazione di massimo 20 parole in italiano, un secondo esempio d'uso quotidiano.
Solo per i chunk: una situazione in italiano per produrlo, nota di pronuncia se nel canto
si fonde o si accorcia.
Aggiungi: un solo punto di grammatica, fino a 3 fenomeni di parlato connesso (solo canzoni),
una stima della percentuale di testo che lo studente capisce già.
Traduci in italiano solo le righe che contengono un chunk o una parola estratti,
una volta per riga; non tradurre le altre righe. Non inventare: se un significato dipende dal contesto, dillo.`

export function buildUserMessage(input: {
  level: Level
  band: [number, number]
  known: string[]
  lines: string[]
  kind?: 'song' | 'text'
}): string {
  const known = input.known.slice(0, 300).join(', ')
  const lines = input.lines.map((l, i) => `${i}: ${l}`).join('\n')
  return [
    input.kind === 'text' ? 'Tipo: testo libero (non una canzone): niente parlato connesso.' : 'Tipo: canzone',
    `Livello: ${input.level}`,
    `Fascia di frequenza: ${input.band[0]}-${input.band[1]}`,
    `Già noti: ${known}`,
    'Testo (righe numerate):',
    lines,
  ].join('\n')
}

const str = { type: 'STRING' } as const
const int = { type: 'INTEGER' } as const
const enumOf = (values: string[]) => ({ type: 'STRING', enum: values })

const chunkProps = {
  base_form: str,
  surface_form: str,
  line_index: int,
  type: enumOf(['phrasal_verb', 'idiom', 'collocation', 'fixed_phrase', 'slang']),
  cefr: enumOf(['B1', 'B2', 'C1', 'C2']),
  register: enumOf(['usable', 'informal', 'song_only']),
  topic: str,
  meaning_it: str,
  explanation_it: str,
  extra_example_en: str,
  production_prompt_it: str,
  pronunciation_note_it: str,
}

const wordProps = {
  lemma: str,
  surface_form: str,
  line_index: int,
  pos: enumOf(['noun', 'verb', 'adjective', 'adverb']),
  cefr: enumOf(['B1', 'B2', 'C1', 'C2']),
  register: enumOf(['usable', 'informal', 'song_only']),
  topic: str,
  meaning_it: str,
  explanation_it: str,
  extra_example_en: str,
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    difficulty_known_pct: int,
    grammar_point: {
      type: 'OBJECT',
      properties: { title: str, explanation_it: str, line_index: int },
      required: ['title', 'explanation_it', 'line_index'],
    },
    connected_speech: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { line_index: int, written: str, sung: str, note_it: str },
        required: ['line_index', 'written', 'sung', 'note_it'],
      },
    },
    chunks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: chunkProps,
        required: Object.keys(chunkProps).filter((k) => k !== 'pronunciation_note_it'),
      },
    },
    words: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: wordProps, required: Object.keys(wordProps) },
    },
    line_translations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { line_index: int, translation_it: str },
        required: ['line_index', 'translation_it'],
      },
    },
  },
  required: ['difficulty_known_pct', 'grammar_point', 'connected_speech', 'chunks', 'words', 'line_translations'],
} as const
