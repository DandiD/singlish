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

export type ExpansionPick = { family: string[]; collocations: string[]; opposites: string[]; nuance: boolean }

/**
 * Cosa farà davvero l'aggiunta: parole nuove (2 card), parole già presenti ma non in studio (passano in studio,
 * 2 card se non ne hanno), collocazioni nuove (2 card), la card Sfumature (1). L'annuncio e l'aggiunta usano questo.
 */
export function expansionPlan(words: Word[], chunks: Chunk[], word: Word, pick: ExpansionPick, cards: { itemId: string; kind: string }[] = []) {
  const e = word.expansion
  if (!e) return { newWords: [], toLearn: [], newChunks: [], nuance: false, cards: 0 }
  const byLemma = new Map(words.map((w) => [w.lemma, w]))
  const keys = new Set(chunks.map((c) => c.key))
  const related = [...e.family.filter((r) => pick.family.includes(r.lemma)), ...e.opposites.filter((r) => pick.opposites.includes(r.lemma))]
  const seen = new Set<string>()
  const newWords: typeof related = []
  const toLearn: Word[] = []
  for (const r of related) {
    const lemma = r.lemma.trim().toLowerCase()
    if (seen.has(lemma)) continue
    seen.add(lemma)
    const found = byLemma.get(lemma)
    if (!found) newWords.push(r)
    // Una parola sospesa resta com'è: le sue card resterebbero fuori dal ripasso.
    else if (found.triage !== 'learn' && !found.suspended) toLearn.push(found)
  }
  // Collocazioni uguali a meno di maiuscole o apostrofi sono un solo chunk.
  const newChunks = e.collocations.filter((c) => {
    if (!pick.collocations.includes(c.base_form)) return false
    const k = normalizeKey(c.base_form)
    if (keys.has(k)) return false
    keys.add(k)
    return true
  })
  const hasS = cards.some((c) => c.itemId === word.id && c.kind === 'S')
  const nuance = pick.nuance && !!e.nuance && !hasS
  const withoutCards = toLearn.filter((w) => !cards.some((c) => c.itemId === w.id && c.kind === 'R')).length
  return { newWords, toLearn, newChunks, nuance, cards: newWords.length * 2 + withoutCards * 2 + newChunks.length * 2 + (nuance ? 1 : 0) }
}

/** Aggiunge al ripasso le voci scelte (e la card Sfumature sulla parola); restituisce quante card sono nate. */
export async function addExpansion(db: SinglishDB, wordId: string, pick: ExpansionPick, now: Date): Promise<number> {
  return db.transaction('rw', db.words, db.chunks, db.cards, async () => {
    const word = await db.words.get(wordId)
    if (!word?.expansion) throw new Error('Expansion missing')
    const plan = expansionPlan(await db.words.toArray(), await db.chunks.toArray(), word, pick, await db.cards.toArray())
    let cards = 0
    for (const r of plan.newWords) {
      const w: Word = {
        id: newId(), lemma: r.lemma.trim().toLowerCase(), surfaceForm: r.lemma.trim(), pos: r.pos, freqRank: 0, songId: word.songId, lineIndex: word.lineIndex,
        contexts: [], cefr: word.cefr, register: 'usable', topic: word.topic, meaningIt: r.meaning_it, explanationIt: '', extraExampleEn: r.example_en,
        triage: 'learn', userEdited: false, suspended: false, origin: 'expand', fromItemId: word.id,
      }
      await db.words.add(w)
      await db.cards.bulkAdd(newCardPair('word', w.id, now))
      cards += 2
    }
    // Una parola già nota o da smistare, scelta qui, passa in studio (come in «Chiedi a Gemini»).
    for (const w of plan.toLearn) {
      // Una parola del profilo senza versi diventa voce della parola espansa: ne segue la canzone e la coda.
      const anchorless = w.contexts.length === 0
      const wasKnown = w.triage === 'known' ? { wasKnown: true } : {}
      await db.words.update(w.id, anchorless
        ? { triage: 'learn', origin: 'expand', fromItemId: word.id, songId: word.songId, lineIndex: word.lineIndex, ...wasKnown }
        : { triage: 'learn', ...wasKnown })
      if ((await db.cards.where('itemId').equals(w.id).filter((c) => c.kind === 'R').count()) === 0) { await db.cards.bulkAdd(newCardPair('word', w.id, now)); cards += 2 }
    }
    for (const c of plan.newChunks) {
      const chunk: Chunk = {
        id: newId(), songId: word.songId, key: normalizeKey(c.base_form), baseForm: c.base_form, surfaceForm: c.base_form, lineIndex: word.lineIndex, contexts: [],
        type: 'collocation', cefr: word.cefr, register: 'usable', topic: word.topic, meaningIt: c.meaning_it, explanationIt: '',
        extraExampleEn: c.example_en, productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false, origin: 'expand', fromItemId: word.id,
      }
      await db.chunks.add(chunk)
      await db.cards.bulkAdd(newCardPair('chunk', chunk.id, now))
      cards += 2
    }
    if (plan.nuance && word.expansion.nuance) {
      await db.words.update(wordId, { nuance: word.expansion.nuance })
      await db.cards.add({ id: newId(), itemType: 'word', itemId: wordId, kind: 'S', unlocked: 1, due: now, fsrs: newFsrsCard(now), goodRCount: 0 })
      cards += 1
    }
    return cards
  })
}
