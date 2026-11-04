import { z } from 'zod'
import type { SinglishDB } from '../db/db'
import type { Production, Rating } from '../db/types'
import { callGemini, GeminiError } from './gemini/client'
import { recordReview } from './scheduler'
import { getSettings } from './settings'

export type Pending = Production & { sessionId: string }

/** Una frase scritta in una card Produci: si salva nella sessione e si corregge a fine sessione. */
export async function saveProduction(db: SinglishDB, sessionId: string, p: Production): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    await db.sessions.update(sessionId, { productions: [...(s.productions ?? []).filter((x) => x.cardId !== p.cardId), p] })
  })
}

/** Tutte le frasi ancora da correggere, in qualunque sessione. */
export async function pendingProductions(db: SinglishDB): Promise<Pending[]> {
  const sessions = await db.sessions.toArray()
  const all = sessions.flatMap((s) => (s.productions ?? []).map((p) => ({ sessionId: s.id, ...p })))
  // Una frase la cui card non c'è più (canzone eliminata, chunk escluso) non si può correggere: non conta…
  const alive = new Set((await db.cards.bulkGet(all.map((p) => p.cardId))).flatMap((c) => (c ? [c.id] : [])))
  // …e nemmeno quella di un chunk sospeso: è fuori dal ripasso finché non lo si riattiva.
  const suspended = new Set((await db.chunks.bulkGet(all.map((p) => p.itemId))).flatMap((c) => (c?.suspended ? [c.id] : [])))
  return all.filter((p) => alive.has(p.cardId) && !suspended.has(p.itemId))
}

export const CORRECT_SYSTEM_PROMPT = `Sei un insegnante di inglese madrelingua che lavora con studenti italiani.
Lo studente ha scritto una frase in inglese per ogni situazione, usando l'espressione indicata.
Le invia tutte insieme, una sola volta. Per ciascuna:
- verdict: "correct" se è corretta e naturale, "fix" se si capisce ma va sistemata, "wrong" se l'espressione è usata male o manca;
- corrected: la frase corretta e naturale (uguale all'originale se è già giusta);
- note_it: una spiegazione in italiano di massimo 25 parole (cosa cambia e perché, o un'alternativa più colloquiale);
- rating: voto FSRS proposto, 4 facile, 3 bene, 2 difficile, 1 di nuovo.
Restituisci i risultati con lo stesso id della frase.`

export const CORRECT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          verdict: { type: 'STRING', enum: ['correct', 'fix', 'wrong'] },
          corrected: { type: 'STRING' },
          note_it: { type: 'STRING' },
          rating: { type: 'INTEGER' },
        },
        required: ['id', 'verdict', 'corrected', 'note_it', 'rating'],
      },
    },
  },
  required: ['results'],
} as const

const CorrectSchema = z.object({
  results: z.array(z.object({
    id: z.string(), verdict: z.enum(['correct', 'fix', 'wrong']), corrected: z.string(), note_it: z.string(), rating: z.number().int(),
  })),
})

export type Feedback = Pending & { chunk: string; situation: string; verdict: 'correct' | 'fix' | 'wrong'; corrected: string; noteIt: string; rating: Rating }

const clampRating = (n: number): Rating => (Math.min(4, Math.max(1, Math.round(n))) as Rating)

/** Corregge tutte le frasi in attesa con una sola chiamata a Gemini. */
export async function correctProductions(db: SinglishDB, deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> }): Promise<Feedback[]> {
  const pending = await pendingProductions(db)
  if (pending.length === 0) return []
  const settings = await getSettings(db)
  const chunks = new Map((await db.chunks.bulkGet(pending.map((p) => p.itemId))).flatMap((c) => (c ? [[c.id, c] as const] : [])))
  const items = pending.filter((p) => chunks.has(p.itemId))
  const user = items
    .map((p) => { const c = chunks.get(p.itemId)!; return `id: ${p.cardId}\nespressione: ${c.baseForm}\nsituazione: ${c.productionPromptIt}\nfrase: ${p.sentence}` })
    .join('\n\n')
  const raw = await callGemini({ apiKey: settings.apiKey, model: settings.model, system: CORRECT_SYSTEM_PROMPT, user, schema: CORRECT_SCHEMA }, deps)
  const res = CorrectSchema.safeParse(raw)
  if (!res.success) throw new GeminiError('bad_json', res.error.message)
  const byId = new Map(res.data.results.map((r) => [r.id, r]))
  return items.flatMap((p) => {
    const r = byId.get(p.cardId)
    if (!r) return []
    const c = chunks.get(p.itemId)!
    return [{ ...p, chunk: c.baseForm, situation: c.productionPromptIt, verdict: r.verdict, corrected: r.corrected.trim() || p.sentence, noteIt: r.note_it, rating: clampRating(r.rating) }]
  })
}

/** Registra i voti confermati e toglie le frasi dall'elenco da correggere. */
export async function confirmProductions(db: SinglishDB, items: Pick<Feedback, 'sessionId' | 'cardId' | 'sentence' | 'elapsedMs' | 'rating'>[], now: Date, retention: number): Promise<void> {
  for (const it of items) {
    await db.transaction('rw', db.cards, db.reviews, db.chunks, db.sessions, db.songs, async () => {
      if (await db.cards.get(it.cardId)) {
        await recordReview(db, it.cardId, { rating: it.rating, auto: false, answer: it.sentence, elapsedMs: it.elapsedMs }, now, retention)
      }
      const s = await db.sessions.get(it.sessionId)
      if (s) await db.sessions.update(it.sessionId, { productions: (s.productions ?? []).filter((p) => p.cardId !== it.cardId) })
    })
  }
}
