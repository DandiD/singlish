import { z } from 'zod'
import type { SinglishDB } from '../db/db'
import type { Chunk, Level, Word } from '../db/types'
import { callGemini, GeminiError } from './gemini/client'
import { ChunkSchema, WordSchema } from './gemini/parse'
import { RESPONSE_SCHEMA } from './gemini/prompt'
import { addContext, contextOf, graduate } from './ingest'
import { newCardPair } from './scheduler'
import { getSettings } from './settings'
import { normalizeKey } from './text'
import { newId } from './id'

/** Le parole di un verso, con la posizione nel verso (apostrofi e trattini fanno parte della parola). */
export function tokenize(line: string): { text: string; start: number; end: number }[] {
  return [...line.matchAll(/[A-Za-z0-9’'-]+/g)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }))
}

export type Pick = { lineIndex: number; text: string }

/** Le parole segnate (`riga:parola`) diventano voci: parole vicine sulla stessa riga sono un'unica espressione. */
export function groupSelection(lines: string[], selected: Set<string>): Pick[] {
  const picks: Pick[] = []
  lines.forEach((line, li) => {
    const toks = tokenize(line)
    let run: number[] = []
    const flush = () => {
      if (run.length) picks.push({ lineIndex: li, text: line.slice(toks[run[0]].start, toks[run[run.length - 1]].end) })
      run = []
    }
    toks.forEach((_, ti) => {
      if (selected.has(`${li}:${ti}`)) run.push(ti)
      else flush()
    })
    flush()
  })
  return picks
}

export const ASK_SYSTEM_PROMPT = `Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Lo studente ha letto un testo e ha segnato le espressioni e le parole che non capisce: le invia tutte insieme,
una sola volta. Per ognuna decidi se è un chunk (phrasal verb, idioma, collocazione, frase fatta, slang:
più parole che vanno imparate insieme) o una parola singola (lemma), e compila gli stessi campi dell'analisi:
forma base, forma nel testo (esattamente come segnata), indice della riga, tipo, livello, registro, tema,
significato in italiano naturale nel contesto del verso, spiegazione di massimo 20 parole in italiano,
un secondo esempio d'uso quotidiano; per i chunk anche una situazione in italiano per produrlo.
Se una parola segnata fa parte di un'espressione più ampia nel verso, restituisci l'espressione.
Traduci in italiano le righe che contengono le voci segnate, una volta per riga.
Non inventare: se un significato dipende dal contesto, dillo.`

export function buildAskMessage(input: { level: Level; lines: string[]; picks: Pick[] }): string {
  return [
    `Livello: ${input.level}`,
    'Testo (righe numerate):',
    input.lines.map((l, i) => `${i}: ${l}`).join('\n'),
    'Segnate dallo studente:',
  ].join('\n') + '\n' + input.picks.map((p) => `${p.lineIndex}: ${p.text}`).join('\n')
}

const { chunks, words, line_translations } = RESPONSE_SCHEMA.properties
export const ASK_SCHEMA = { type: 'OBJECT', properties: { chunks, words, line_translations }, required: ['chunks', 'words', 'line_translations'] } as const

const AskSchema = z.object({
  chunks: z.array(ChunkSchema),
  words: z.array(WordSchema),
  line_translations: z.array(z.object({ line_index: z.number().int(), translation_it: z.string() })).default([]),
})

/**
 * Chiede a Gemini, con una sola chiamata, tutte le voci segnate nel testo e le salva: chunk e parole entrano
 * subito nel ripasso (le ha scelte lo studente). Una voce già presente non si duplica: riceve il verso e,
 * se era una parola da smistare o nota, passa in studio.
 */
export async function askGemini(
  db: SinglishDB,
  songId: string,
  picks: Pick[],
  deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: Date },
): Promise<{ added: number; existing: number }> {
  if (picks.length === 0) return { added: 0, existing: 0 }
  const [settings, song] = await Promise.all([getSettings(db), db.songs.get(songId)])
  if (!song) throw new Error(`Song not found: ${songId}`)
  const raw = await callGemini(
    { apiKey: settings.apiKey, model: settings.model, system: ASK_SYSTEM_PROMPT, user: buildAskMessage({ level: settings.level, lines: song.lines, picks }), schema: ASK_SCHEMA },
    { fetch: deps.fetch, sleep: deps.sleep },
  )
  const res = AskSchema.safeParse(raw)
  if (!res.success) throw new GeminiError('bad_json', res.error.message)
  const inRange = (i: number) => i >= 0 && i < song.lines.length
  const now = deps.now

  return db.transaction('rw', db.songs, db.chunks, db.words, db.cards, async () => {
    let added = 0
    let existing = 0
    for (const c of res.data.chunks.filter((c) => inRange(c.line_index))) {
      const key = normalizeKey(c.base_form)
      const found = await db.chunks.where('key').equals(key).first()
      if (found) {
        if (addContext(found.contexts, contextOf(songId, c.line_index, c.surface_form, found.surfaceForm))) {
          graduate(found)
          await db.chunks.put(found)
        }
        existing++
        continue
      }
      const chunk: Chunk = {
        id: newId(), songId, key, baseForm: c.base_form, surfaceForm: c.surface_form, lineIndex: c.line_index,
        contexts: [{ songId, lineIndex: c.line_index }], type: c.type, cefr: c.cefr, register: c.register, topic: c.topic,
        meaningIt: c.meaning_it, explanationIt: c.explanation_it, extraExampleEn: c.extra_example_en,
        productionPromptIt: c.production_prompt_it, pronunciationNoteIt: c.pronunciation_note_it ?? '', userEdited: false, suspended: false,
      }
      await db.chunks.add(chunk)
      await db.cards.bulkAdd(newCardPair('chunk', chunk.id, now))
      added++
    }
    for (const w of res.data.words.filter((w) => inRange(w.line_index))) {
      const lemma = w.lemma.trim().toLowerCase()
      const found = await db.words.where('lemma').equals(lemma).first()
      if (found) {
        if (addContext(found.contexts, contextOf(songId, w.line_index, w.surface_form, found.surfaceForm))) graduate(found)
        if (found.triage !== 'learn') {
          found.triage = 'learn'
          if ((await db.cards.where('itemId').equals(found.id).count()) === 0) await db.cards.bulkAdd(newCardPair('word', found.id, now))
        }
        await db.words.put(found)
        existing++
        continue
      }
      const word: Word = {
        id: newId(), lemma, surfaceForm: w.surface_form, pos: w.pos, freqRank: 0, songId, lineIndex: w.line_index,
        contexts: [{ songId, lineIndex: w.line_index }], cefr: w.cefr, register: w.register, topic: w.topic,
        meaningIt: w.meaning_it, explanationIt: w.explanation_it, extraExampleEn: w.extra_example_en,
        triage: 'learn', userEdited: false, suspended: false,
      }
      await db.words.add(word)
      await db.cards.bulkAdd(newCardPair('word', word.id, now))
      added++
    }
    // Traduzioni dei versi: si aggiungono quelle che mancano.
    const have = new Map((song.lineTranslations ?? []).map((t) => [t.lineIndex, t]))
    for (const t of res.data.line_translations) {
      const text = t.translation_it.trim()
      if (inRange(t.line_index) && text && !have.has(t.line_index)) have.set(t.line_index, { lineIndex: t.line_index, textIt: text })
    }
    await db.songs.update(songId, { lineTranslations: [...have.values()].sort((a, b) => a.lineIndex - b.lineIndex) })
    return { added, existing }
  })
}
