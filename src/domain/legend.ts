import type { LexEntry } from './lexicon'

/** Classe di evidenziazione e nome (singolare) di ogni tipo: legenda dello Studio. */
export const LEGEND: [string, string][] = [
  ['pv', 'phrasal verb'], ['id', 'idioma'], ['co', 'collocazione'], ['fp', 'espressione fissa'], ['sl', 'slang'], ['w', 'parola'], ['cs', 'pronuncia'],
]

/** Tipi del lessico nell'ordine della striscia, con la classe di legenda e il nome al plurale. */
export const TYPE_ORDER: { type: LexEntry['type']; cls: string; label: string }[] = [
  { type: 'phrasal_verb', cls: 'pv', label: 'Phrasal verb' },
  { type: 'idiom', cls: 'id', label: 'Idiomi' },
  { type: 'collocation', cls: 'co', label: 'Collocazioni' },
  { type: 'fixed_phrase', cls: 'fp', label: 'Frasi fisse' },
  { type: 'slang', cls: 'sl', label: 'Slang' },
  { type: 'word', cls: 'w', label: 'Parole' },
]
