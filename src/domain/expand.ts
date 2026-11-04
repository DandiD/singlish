import { z } from 'zod'
import type { SinglishDB } from '../db/db'
import type { Chunk, Word } from '../db/types'
import { callGemini, GeminiError } from './gemini/client'
import { newCardPair, newFsrsCard } from './scheduler'
import { getSettings } from './settings'
import { normalizeKey } from './text'
import { newId } from './id'

const Related = z.object({ lemma: z.string().min(1), pos: z.string(), meaning_it: z.string(), example_en: z.string() })
const Colloc = z.object({ base_form: z.string().min(1), meaning_it: z.string(), example_en: z.string() })
const NuanceSchema = z.object({
  options: z.array(z.string().min(1)).min(2).max(4), answer: z.string().min(1), situation_it: z.string(),
  sentence_en: z.string(), explanation_it: z.string(), summary_it: z.string(),
})
const ExpansionSchema = z.object({ family: z.array(Related), collocations: z.array(Colloc), opposites: z.array(Related), nuance: NuanceSchema.nullable() })
export type Expansion = z.infer<typeof ExpansionSchema>
export type Nuance = z.infer<typeof NuanceSchema>

const relatedItems = { type: 'ARRAY', items: { type: 'OBJECT', properties: { lemma: { type: 'STRING' }, pos: { type: 'STRING' }, meaning_it: { type: 'STRING' }, example_en: { type: 'STRING' } }, required: ['lemma', 'pos', 'meaning_it', 'example_en'] } } as const
export const EXPAND_SCHEMA = {
  type: 'OBJECT',
  properties: {
    family: relatedItems,
    collocations: { type: 'ARRAY', items: { type: 'OBJECT', properties: { base_form: { type: 'STRING' }, meaning_it: { type: 'STRING' }, example_en: { type: 'STRING' } }, required: ['base_form', 'meaning_it', 'example_en'] } },
    opposites: relatedItems,
    nuance: {
      type: 'OBJECT', nullable: true,
      properties: { options: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'STRING' }, situation_it: { type: 'STRING' }, sentence_en: { type: 'STRING' }, explanation_it: { type: 'STRING' }, summary_it: { type: 'STRING' } },
      required: ['options', 'answer', 'situation_it', 'sentence_en', 'explanation_it', 'summary_it'],
    },
  },
  required: ['family', 'collocations', 'opposites', 'nuance'],
} as const

export const EXPAND_SYSTEM_PROMPT = `Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Per la parola indicata proponi, utili al livello dello studente e a quello sopra:
- family: 2-4 parole della stessa famiglia (altre parti del discorso);
- collocations: 2-4 collocazioni frequenti con la parola;
- opposites: 0-2 contrari;
- nuance: se esistono parole vicine da non confondere, 3 opzioni (la parola giusta e 2 vicine), una situazione in italiano,
  una frase in inglese con ____ al posto della parola giusta, la spiegazione in italiano di quando usare quale
  (massimo 30 parole) e un riassunto di 8 parole; altrimenti null.
Per ognuna: significato in italiano naturale ed esempio d'uso quotidiano in inglese. Non inventare.`

/** Chiede a Gemini la famiglia della parola, le collocazioni, i contrari e le sfumature; poi il risultato resta salvato. */
export async function requestExpansion(db: SinglishDB, wordId: string, deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }): Promise<Expansion> {
  const word = await db.words.get(wordId)
  if (!word) throw new Error(`Word not found: ${wordId}`)
  if (word.expansion) return word.expansion
  const settings = await getSettings(db)
  const user = `Livello: ${settings.level}\nParola: ${word.lemma} (${word.pos})\nSignificato: ${word.meaningIt}`
  const raw = await callGemini({ apiKey: settings.apiKey, model: settings.model, system: EXPAND_SYSTEM_PROMPT, user, schema: EXPAND_SCHEMA }, deps)
  const res = ExpansionSchema.safeParse(raw)
  if (!res.success) throw new GeminiError('bad_json', res.error.message)
  const expansion = { ...res.data, nuance: res.data.nuance && res.data.nuance.options.includes(res.data.nuance.answer) ? res.data.nuance : null }
  await db.words.update(wordId, { expansion })
  return expansion
}

/** Aggiunge al ripasso le voci scelte (e la card Sfumature sulla parola); restituisce quante card-voce sono nate. */
export async function addExpansion(
  db: SinglishDB,
  wordId: string,
  pick: { family: string[]; collocations: string[]; opposites: string[]; nuance: boolean },
  now: Date,
): Promise<number> {
  return db.transaction('rw', db.words, db.chunks, db.cards, async () => {
    const word = await db.words.get(wordId)
    if (!word?.expansion) throw new Error('Expansion missing')
    const e = word.expansion
    let added = 0
    const addWord = async (r: z.infer<typeof Related>) => {
      const lemma = r.lemma.trim().toLowerCase()
      if (await db.words.where('lemma').equals(lemma).first()) return
      const w: Word = {
        id: newId(), lemma, surfaceForm: r.lemma.trim(), pos: r.pos, freqRank: 0, songId: word.songId, lineIndex: word.lineIndex, contexts: [],
        cefr: word.cefr, register: 'usable', topic: word.topic, meaningIt: r.meaning_it, explanationIt: '', extraExampleEn: r.example_en,
        triage: 'learn', userEdited: false, suspended: false, origin: 'expand',
      }
      await db.words.add(w)
      await db.cards.bulkAdd(newCardPair('word', w.id, now))
      added++
    }
    for (const r of e.family.filter((x) => pick.family.includes(x.lemma))) await addWord(r)
    for (const r of e.opposites.filter((x) => pick.opposites.includes(x.lemma))) await addWord(r)
    for (const c of e.collocations.filter((x) => pick.collocations.includes(x.base_form))) {
      const key = normalizeKey(c.base_form)
      if (await db.chunks.where('key').equals(key).first()) continue
      const chunk: Chunk = {
        id: newId(), songId: word.songId, key, baseForm: c.base_form, surfaceForm: c.base_form, lineIndex: word.lineIndex, contexts: [],
        type: 'collocation', cefr: word.cefr, register: 'usable', topic: word.topic, meaningIt: c.meaning_it, explanationIt: '',
        extraExampleEn: c.example_en, productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, origin: 'expand',
      }
      await db.chunks.add(chunk)
      await db.cards.bulkAdd(newCardPair('chunk', chunk.id, now))
      added++
    }
    if (pick.nuance && e.nuance && (await db.cards.where('itemId').equals(wordId).filter((c) => c.kind === 'S').count()) === 0) {
      await db.words.update(wordId, { nuance: e.nuance })
      await db.cards.add({ id: newId(), itemType: 'word', itemId: wordId, kind: 'S', unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
      added++
    }
    return added
  })
}
