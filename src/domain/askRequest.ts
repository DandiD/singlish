import { z } from 'zod'
import { callGemini, GeminiError, type GeminiDeps } from './gemini/client'
import type { Level } from '../db/types'
import type { AskRequest } from './askSelection'
import { normalizeKey } from './text'

export const ASK_SYSTEM_PROMPT = `Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Lo studente sta studiando il testo e ti manda delle richieste, ognuna con un id.
Rispondi a ogni id esattamente una volta, senza saltarne nessuno e senza aggiungerne.
Prima di rispondere leggi il verso e quelli vicini: il significato è quello che ha in quel verso,
non quello del dizionario. Se è figurato, ironico, slang o un gioco di parole, dillo.
Per ogni id scrivi translation_it: la traduzione di tutto il verso in italiano naturale,
come la direbbe un italiano, non parola per parola. Non è mai vuota.
Richieste w (parole o espressioni segnate):
- decidi se è un chunk (phrasal verb, idioma, collocazione, frase fatta, slang: più parole da imparare
  insieme) o una parola singola (lemma);
- se ciò che è segnato fa parte di un'espressione più ampia nel verso, restituisci l'espressione intera
  in surface_form e metti widened a true; altrimenti surface_form è esattamente il testo segnato;
- forma base, tipo, livello, registro (usable | informal | song_only), tema, significato in italiano
  nel contesto del verso, spiegazione di massimo 20 parole in italiano, un esempio d'uso quotidiano in
  inglese; per i chunk anche una situazione in italiano per produrlo.
Richieste v (versi interi):
- sense_it: cosa dice davvero il verso, massimo 40 parole;
- grammar_it: una costruzione utile o insolita del verso, massimo 30 parole; null se non c'è niente di utile;
- culture_it: riferimento culturale, slang o citazione, massimo 30 parole; null se non c'è;
- proposals: da 0 a 2 chunk del verso utili al livello dello studente, con gli stessi campi dei chunk
  e surface_form esattamente come compare nel verso.
Non inventare: se non sei sicuro, dillo nella spiegazione.`

/** Il messaggio per Gemini: testo numerato e richieste (`w*` parole o espressioni, `v*` versi interi). */
export function buildAskMessage(input: {
  kind: 'song' | 'text'
  title: string
  artist: string
  level: Level
  lines: string[]
  requests: AskRequest[]
}): string {
  const title = input.artist ? `${input.title} — ${input.artist}` : input.title
  const out = [input.kind === 'text' ? 'Tipo: testo libero (non una canzone)' : 'Tipo: canzone']
  if (title) out.push(`Titolo: ${title}`)
  out.push(`Livello: ${input.level}`, 'Testo (righe numerate):')
  input.lines.forEach((l, i) => out.push(`${i}: ${l}`))
  out.push('Richieste:')
  for (const r of input.requests) out.push(r.text === undefined ? `${r.id} · riga ${r.lineIndex}` : `${r.id} · riga ${r.lineIndex} · "${r.text}"`)
  return out.join('\n')
}

const CHUNK_TYPES = ['phrasal_verb', 'idiom', 'collocation', 'fixed_phrase', 'slang'] as const
const WORD_TYPES = ['noun', 'verb', 'adjective', 'adverb'] as const
const CEFR = ['B1', 'B2', 'C1', 'C2'] as const
const REGISTER = ['usable', 'informal', 'song_only'] as const

const str = { type: 'STRING' } as const
const enumOf = (values: readonly string[]) => ({ type: 'STRING', enum: [...values] })

const sharedProps = {
  base_form: str,
  cefr: enumOf(CEFR),
  register: enumOf(REGISTER),
  topic: str,
  meaning_it: str,
  explanation_it: str,
  extra_example_en: str,
  production_prompt_it: str,
}
const itemProps = {
  item_type: enumOf(['chunk', 'word']),
  surface_form: str,
  widened: { type: 'BOOLEAN' },
  type: enumOf([...CHUNK_TYPES, ...WORD_TYPES]),
  ...sharedProps,
}
const proposalProps = { type: enumOf(CHUNK_TYPES), surface_form: str, ...sharedProps }
const keys = (o: object) => Object.keys(o)

export const ASK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: str,
          translation_it: str,
          item: { type: 'OBJECT', nullable: true, properties: itemProps, required: keys(itemProps) },
          verse: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              sense_it: str,
              grammar_it: { type: 'STRING', nullable: true },
              culture_it: { type: 'STRING', nullable: true },
              proposals: { type: 'ARRAY', items: { type: 'OBJECT', properties: proposalProps, required: keys(proposalProps) } },
            },
            required: ['sense_it', 'grammar_it', 'culture_it', 'proposals'],
          },
        },
        required: ['id', 'translation_it', 'item', 'verse'],
      },
    },
  },
  required: ['answers'],
} as const

const text = z.string().trim().min(1)
const shared = {
  base_form: text,
  cefr: z.enum(CEFR),
  register: z.enum(REGISTER),
  topic: z.string(),
  meaning_it: text,
  explanation_it: z.string(),
  extra_example_en: z.string(),
  production_prompt_it: z.string().default(''),
}
export const AskItemSchema = z.discriminatedUnion('item_type', [
  z.object({ item_type: z.literal('chunk'), surface_form: text, widened: z.boolean().default(false), type: z.enum(CHUNK_TYPES), ...shared }),
  z.object({ item_type: z.literal('word'), surface_form: text, widened: z.boolean().default(false), type: z.enum(WORD_TYPES), ...shared }),
])
// La forma nel verso manca nelle bozze salvate prima che la si chiedesse.
export const AskProposalSchema = z.object({ type: z.enum(CHUNK_TYPES), surface_form: z.string().optional(), ...shared })
export const AskVerseSchema = z.object({
  sense_it: text,
  grammar_it: z.string().nullish().transform((s) => s?.trim() || null),
  culture_it: z.string().nullish().transform((s) => s?.trim() || null),
  proposals: z.array(AskProposalSchema),
})
export type AskItem = z.infer<typeof AskItemSchema>
export type AskProposal = z.infer<typeof AskProposalSchema>
export type AskVerse = z.infer<typeof AskVerseSchema>

export type AskAnswer = { key: string; lineIndex: number; text?: string; translationIt: string; item: AskItem | null; verse: AskVerse | null }

export const answerKey = (r: { lineIndex: number; text?: string }): string =>
  r.text === undefined ? `v:${r.lineIndex}` : `w:${r.lineIndex}:${normalizeKey(r.text)}`

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const absent = (x: unknown) => x === null || x === undefined

type Parsed = { translationIt: string; item: AskItem | null; verse: AskVerse | null }

/** Valida una risposta per la sua richiesta; `null` se non è completa. Le proposte non valide si scartano da sole. */
function parseOne(entry: Record<string, unknown>, isWord: boolean): Parsed | null {
  const translationIt = typeof entry.translation_it === 'string' ? entry.translation_it.trim() : ''
  if (!translationIt) return null
  if (isWord) {
    if (!absent(entry.verse)) return null
    const item = AskItemSchema.safeParse(entry.item)
    return item.success ? { translationIt, item: item.data, verse: null } : null
  }
  if (!absent(entry.item) || !isObj(entry.verse)) return null
  const proposals = Array.isArray(entry.verse.proposals) ? entry.verse.proposals.filter((p) => AskProposalSchema.safeParse(p).success) : []
  const verse = AskVerseSchema.safeParse({ ...entry.verse, proposals })
  return verse.success ? { translationIt, item: null, verse: verse.data } : null
}

/**
 * Tiene la prima risposta completa per ogni richiesta; riga e testo vengono sempre dalla richiesta.
 * Le proposte di un verso uguali a una voce della risposta si scartano, e se ne tengono al massimo due.
 */
export function checkAnswers(raw: unknown, requests: AskRequest[]): { answers: AskAnswer[]; missing: AskRequest[] } {
  if (!isObj(raw) || !Array.isArray(raw.answers)) throw new GeminiError('bad_json', 'Missing answers array')
  const byId = new Map(requests.map((r) => [r.id, r]))
  const done = new Map<string, Parsed>()
  for (const entry of raw.answers) {
    if (!isObj(entry) || typeof entry.id !== 'string' || done.has(entry.id)) continue
    const req = byId.get(entry.id)
    const parsed = req && parseOne(entry, req.text !== undefined)
    if (parsed) done.set(entry.id, parsed)
  }
  const itemKeys = new Set([...done.values()].flatMap((p) => (p.item ? [normalizeKey(p.item.base_form)] : [])))
  const answers: AskAnswer[] = []
  const missing: AskRequest[] = []
  for (const req of requests) {
    const p = done.get(req.id)
    if (!p) {
      missing.push(req)
      continue
    }
    const verse = p.verse && { ...p.verse, proposals: p.verse.proposals.filter((x) => !itemKeys.has(normalizeKey(x.base_form))).slice(0, 2) }
    answers.push({ key: answerKey(req), lineIndex: req.lineIndex, ...(req.text !== undefined && { text: req.text }), translationIt: p.translationIt, item: p.item, verse })
  }
  return { answers, missing }
}

/**
 * Chiede a Gemini tutte le richieste; per le mancanti fa una sola seconda chiamata.
 * Un errore della prima si propaga; se la seconda fallisce le mancanti restano `unanswered`.
 */
export async function requestAnswers(
  input: Parameters<typeof buildAskMessage>[0],
  gemini: { apiKey: string; model: string },
  deps: GeminiDeps,
): Promise<{ answers: AskAnswer[]; unanswered: AskRequest[] }> {
  const call = async (requests: AskRequest[]) =>
    checkAnswers(await callGemini({ ...gemini, system: ASK_SYSTEM_PROMPT, user: buildAskMessage({ ...input, requests }), schema: ASK_SCHEMA }, deps), requests)
  const first = await call(input.requests)
  if (first.missing.length === 0) return { answers: first.answers, unanswered: [] }
  let second = { answers: [] as AskAnswer[], missing: first.missing }
  try {
    second = await call(first.missing)
  } catch {
    // la seconda chiamata è un recupero: se fallisce restano le risposte già avute
  }
  const order = new Map(input.requests.map((r, i) => [answerKey(r), i]))
  const answers = [...first.answers, ...second.answers].sort((a, b) => order.get(a.key)! - order.get(b.key)!)
  return { answers, unanswered: second.missing }
}
