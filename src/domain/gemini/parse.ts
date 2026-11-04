import { z } from 'zod'
import { normalizeKey } from '../text'
import { GeminiError } from './client'

const register = z.enum(['usable', 'informal', 'song_only'])
const cefr = z.enum(['B1', 'B2', 'C1', 'C2'])
const idx = z.number().int()

export const ChunkSchema = z.object({
  base_form: z.string().min(1),
  surface_form: z.string().min(1),
  line_index: idx,
  type: z.enum(['phrasal_verb', 'idiom', 'collocation', 'fixed_phrase', 'slang']),
  cefr,
  register,
  topic: z.string(),
  meaning_it: z.string(),
  explanation_it: z.string(),
  extra_example_en: z.string(),
  production_prompt_it: z.string(),
  pronunciation_note_it: z.string().optional(),
})

export const WordSchema = z.object({
  lemma: z.string().min(1),
  surface_form: z.string().min(1),
  line_index: idx,
  pos: z.enum(['noun', 'verb', 'adjective', 'adverb']),
  cefr,
  register,
  topic: z.string(),
  meaning_it: z.string(),
  explanation_it: z.string(),
  extra_example_en: z.string(),
})

export const AnalysisSchema = z.object({
  difficulty_known_pct: z.number(),
  grammar_point: z
    .object({ title: z.string(), explanation_it: z.string(), line_index: idx })
    .nullable(),
  connected_speech: z.array(
    z.object({ line_index: idx, written: z.string(), sung: z.string(), note_it: z.string() }),
  ),
  chunks: z.array(ChunkSchema),
  words: z.array(WordSchema),
  // Le analisi salvate prima della traduzione dei versi non ce l'hanno: si accetta anche l'assenza.
  line_translations: z.array(z.object({ line_index: idx, translation_it: z.string() })).default([]),
})

export type Analysis = z.infer<typeof AnalysisSchema>
export type AnalysisChunk = Analysis['chunks'][number]
export type AnalysisWord = Analysis['words'][number]

export function parseAnalysis(raw: unknown, lineCount: number): Analysis {
  const res = AnalysisSchema.safeParse(raw)
  if (!res.success) throw new GeminiError('bad_json', res.error.message)
  const a = res.data
  const inRange = (i: number) => i >= 0 && i < lineCount

  const seenChunks = new Set<string>()
  const chunks = a.chunks.filter((c) => {
    if (!inRange(c.line_index)) return false
    const k = normalizeKey(c.base_form)
    if (seenChunks.has(k)) return false
    seenChunks.add(k)
    return true
  })

  const seenWords = new Set<string>()
  const words = a.words.filter((w) => {
    if (!inRange(w.line_index)) return false
    const k = w.lemma.trim().toLowerCase()
    if (seenWords.has(k)) return false
    seenWords.add(k)
    return true
  })

  const seenLines = new Set<number>()
  const line_translations = a.line_translations.flatMap((t) => {
    const text = t.translation_it.trim()
    if (!inRange(t.line_index) || text === '' || seenLines.has(t.line_index)) return []
    seenLines.add(t.line_index)
    return [{ line_index: t.line_index, translation_it: text }]
  })

  return {
    difficulty_known_pct: Math.min(100, Math.max(0, Math.round(a.difficulty_known_pct))),
    grammar_point: a.grammar_point && inRange(a.grammar_point.line_index) ? a.grammar_point : null,
    connected_speech: a.connected_speech.filter((c) => inRange(c.line_index)),
    chunks,
    words,
    line_translations,
  }
}
