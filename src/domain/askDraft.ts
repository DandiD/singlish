import type { SinglishDB } from '../db/db'
import type { AskDraft, Chunk, LineNote, Word } from '../db/types'
import { answerKey, requestAnswers, type AskAnswer, type AskItem, type AskProposal } from './askRequest'
import { MAX_REQUESTS, type AskRequest } from './askSelection'
import { newId } from './id'
import { addContext, contextOf, graduate } from './ingest'
import { newCardPair } from './scheduler'
import { getSettings } from './settings'
import { findForm } from './songItems'
import { normalizeKey } from './text'

const byLineThenWord = (a: AskAnswer, b: AskAnswer) =>
  a.lineIndex - b.lineIndex || Number(a.text === undefined) - Number(b.text === undefined)

/**
 * Salva in una transazione traduzioni (solo quelle mancanti), note dei versi e bozza delle risposte
 * (unita a quella pendente per chiave: le nuove sostituiscono).
 */
export async function saveAnswers(
  db: SinglishDB,
  songId: string,
  result: { answers: AskAnswer[]; unanswered: AskRequest[] },
): Promise<AskDraft> {
  return db.transaction('rw', db.songs, async () => {
    const song = await db.songs.get(songId)
    if (!song) throw new Error(`Song deleted during the request: ${songId}`)

    const translations = new Map((song.lineTranslations ?? []).map((t) => [t.lineIndex, t]))
    for (const a of result.answers) {
      if (!translations.has(a.lineIndex)) translations.set(a.lineIndex, { lineIndex: a.lineIndex, textIt: a.translationIt })
    }

    const notes = new Map((song.lineNotes ?? []).map((n) => [n.lineIndex, n]))
    for (const a of result.answers) {
      if (!a.verse) continue
      const note: LineNote = { lineIndex: a.lineIndex, senseIt: a.verse.sense_it, grammarIt: a.verse.grammar_it, cultureIt: a.verse.culture_it }
      notes.set(a.lineIndex, note)
    }

    const answers = new Map((song.askDraft?.answers ?? []).map((a) => [a.key, a]))
    for (const a of result.answers) answers.set(a.key, a)
    const unanswered = new Map((song.askDraft?.unanswered ?? []).map((r) => [answerKey(r), r]))
    for (const r of result.unanswered) if (!unanswered.has(answerKey(r))) unanswered.set(answerKey(r), r)
    for (const key of answers.keys()) unanswered.delete(key)

    const draft: AskDraft = { answers: [...answers.values()].sort(byLineThenWord), unanswered: [...unanswered.values()] }
    await db.songs.update(songId, {
      lineTranslations: [...translations.values()].sort((a, b) => a.lineIndex - b.lineIndex),
      lineNotes: [...notes.values()].sort((a, b) => a.lineIndex - b.lineIndex),
      askDraft: draft,
    })
    return draft
  })
}

/**
 * Rinumera le richieste prima dell'invio: le bozze unite da richieste diverse possono avere lo stesso id
 * (due `w1` su righe diverse) e la risposta andrebbe a entrambe. `w1…` per le parole in ordine di testo, `v1…` per i versi.
 */
function renumber(requests: AskRequest[]): AskRequest[] {
  const byLine = (a: AskRequest, b: AskRequest) => a.lineIndex - b.lineIndex // sort stabile: a parità resta l'ordine originale
  const words = requests.filter((r) => r.text !== undefined).sort(byLine).map((r, i) => ({ ...r, id: `w${i + 1}` }))
  const verses = requests.filter((r) => r.text === undefined).sort(byLine).map((r, i) => ({ ...r, id: `v${i + 1}` }))
  return [...words, ...verses].slice(0, MAX_REQUESTS)
}

/** Chiede a Gemini le richieste dello studente e salva risposte e bozza. */
export async function askGemini(
  db: SinglishDB,
  songId: string,
  requests: AskRequest[],
  deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> },
): Promise<AskDraft> {
  const [settings, song] = await Promise.all([getSettings(db), db.songs.get(songId)])
  if (!song) throw new Error(`Song not found: ${songId}`)
  const result = await requestAnswers(
    { kind: song.kind, title: song.title, artist: song.artist, level: settings.level, lines: song.lines, requests: renumber(requests) },
    { apiKey: settings.apiKey, model: settings.model },
    deps,
  )
  return saveAnswers(db, songId, result)
}

/** Chiave di una proposta di un verso nell'insieme delle voci spuntate. */
export const proposalKey = (a: AskAnswer, p: AskProposal): string => `${a.key}>${normalizeKey(p.base_form)}`

/** Di partenza sono spuntate le voci chieste dallo studente; le proposte restano da scegliere. */
export function defaultKeep(draft: AskDraft): Set<string> {
  return new Set(draft.answers.filter((a) => a.item).map((a) => a.key))
}

/** Le forme candidate, dalla più fedele al verso: quella di Gemini, il testo segnato, la forma base. */
type Kept = { kind: 'chunk' | 'word'; lineIndex: number; forms: (string | undefined)[]; fields: AskItem | AskProposal }

/** Le voci spuntate, nell'ordine della bozza: item `w*` e proposte dei versi. */
function keptEntries(draft: AskDraft, keep: ReadonlySet<string>): Kept[] {
  const out: Kept[] = []
  for (const a of draft.answers) {
    if (a.item && keep.has(a.key)) {
      out.push({ kind: a.item.item_type, lineIndex: a.lineIndex, forms: [a.item.surface_form, a.text, a.item.base_form], fields: a.item })
    }
    for (const p of a.verse?.proposals ?? []) {
      if (keep.has(proposalKey(a, p))) out.push({ kind: 'chunk', lineIndex: a.lineIndex, forms: [p.surface_form, p.base_form], fields: p })
    }
  }
  return out
}

/**
 * La forma da salvare: la prima che compare davvero nel verso, perché il testo la evidenzi
 * (Gemini a volte restituisce la forma base, «pick up» per «picked up»). Se nessuna compare, quella di Gemini.
 */
const surfaceIn = (line: string, forms: (string | undefined)[]): string => {
  const list = forms.filter((f): f is string => !!f?.trim())
  return list.find((f) => findForm(line, f)) ?? list[0]
}

const lemmaOf = (k: Kept) => k.fields.base_form.trim().toLowerCase()

/** Quante card nascono e quante voci c'erano già, per l'annuncio prima di «Aggiungi». */
export function keepPlan(
  words: Word[],
  chunks: Chunk[],
  cards: { itemId: string; kind: string }[],
  draft: AskDraft,
  keep: ReadonlySet<string>,
): { cards: number; existing: number } {
  const chunkKeys = new Set(chunks.map((c) => c.key))
  const wordByLemma = new Map(words.map((w) => [w.lemma, w]))
  const hasR = new Set(cards.filter((c) => c.kind === 'R').map((c) => c.itemId))
  // Una voce ripetuta in più versi conta una volta sola.
  const seen = new Set<string>()
  let newCards = 0
  let existing = 0
  for (const k of keptEntries(draft, keep)) {
    const id = `${k.kind}:${k.kind === 'chunk' ? normalizeKey(k.fields.base_form) : lemmaOf(k)}`
    if (seen.has(id)) continue
    seen.add(id)
    if (k.kind === 'chunk') {
      if (chunkKeys.has(normalizeKey(k.fields.base_form))) existing++
      else newCards += 2
      continue
    }
    const found = wordByLemma.get(lemmaOf(k))
    if (!found) newCards += 2
    else {
      existing++
      if (found.triage !== 'learn' && !hasR.has(found.id)) newCards += 2
    }
  }
  return { cards: newCards, existing }
}

/**
 * Aggiunge al ripasso le voci spuntate: chunk e parole entrano subito (le ha scelte lo studente).
 * Una voce già presente non si duplica: riceve il verso e, se era una parola da smistare o nota, passa in studio.
 * La bozza si toglie.
 */
export async function keepAnswers(
  db: SinglishDB,
  songId: string,
  keep: ReadonlySet<string>,
  now: Date,
): Promise<{ added: number; existing: number }> {
  return db.transaction('rw', db.songs, db.chunks, db.words, db.cards, async () => {
    const song = await db.songs.get(songId)
    if (!song) throw new Error(`Song not found: ${songId}`)
    let added = 0
    let existing = 0
    // Le voci create in questa chiamata: se si ripetono, prendono il verso ma non contano come «c'era già».
    const created = new Set<string>()
    // Una voce che c'era già conta una volta sola, anche se segnata in più versi.
    const counted = new Set<string>()
    const count = (id: string) => {
      if (!created.has(id) && !counted.has(id)) { counted.add(id); existing++ }
    }
    for (const k of keptEntries(song.askDraft ?? { answers: [], unanswered: [] }, keep)) {
      const f = k.fields
      const surface = surfaceIn(song.lines[k.lineIndex] ?? '', k.forms)
      if (k.kind === 'chunk') {
        const key = normalizeKey(f.base_form)
        const found = await db.chunks.where('key').equals(key).first()
        if (found) {
          addContext(found.contexts, contextOf(songId, k.lineIndex, surface, found.surfaceForm))
          graduate(found)
          found.suspended = false // chiesta dallo studente: torna nel ripasso
          await db.chunks.put(found)
          count(found.id)
          continue
        }
        const chunk: Chunk = {
          id: newId(), songId, key, baseForm: f.base_form, surfaceForm: surface, lineIndex: k.lineIndex,
          contexts: [{ songId, lineIndex: k.lineIndex }], type: f.type as Chunk['type'], cefr: f.cefr, register: f.register, topic: f.topic,
          meaningIt: f.meaning_it, explanationIt: f.explanation_it, extraExampleEn: f.extra_example_en,
          productionPromptIt: f.production_prompt_it, pronunciationNoteIt: '', userEdited: false, suspended: false,
        }
        await db.chunks.add(chunk)
        created.add(chunk.id)
        await db.cards.bulkAdd(newCardPair('chunk', chunk.id, now))
        added++
        continue
      }
      const lemma = lemmaOf(k)
      const found = await db.words.where('lemma').equals(lemma).first()
      if (found) {
        if (addContext(found.contexts, contextOf(songId, k.lineIndex, surface, found.surfaceForm))) graduate(found)
        found.suspended = false // chiesta dallo studente: torna nel ripasso
        if (found.triage !== 'learn') {
          if (found.triage === 'known') found.wasKnown = true
          found.triage = 'learn'
          // Riconosci e Completa servono anche se la parola ha già un'altra card (es. Sfumature).
          if ((await db.cards.where('itemId').equals(found.id).filter((c) => c.kind === 'R').count()) === 0) await db.cards.bulkAdd(newCardPair('word', found.id, now))
        }
        await db.words.put(found)
        count(found.id)
        continue
      }
      const word: Word = {
        id: newId(), lemma, surfaceForm: surface, pos: f.type as Word['pos'], freqRank: 0, songId, lineIndex: k.lineIndex,
        contexts: [{ songId, lineIndex: k.lineIndex }], cefr: f.cefr, register: f.register, topic: f.topic,
        meaningIt: f.meaning_it, explanationIt: f.explanation_it, extraExampleEn: f.extra_example_en,
        triage: 'learn', userEdited: false, suspended: false,
      }
      await db.words.add(word)
      created.add(word.id)
      await db.cards.bulkAdd(newCardPair('word', word.id, now))
      added++
    }
    await db.songs.update(songId, { askDraft: undefined })
    return { added, existing }
  })
}

/** «Chiudi senza aggiungere»: toglie la bozza, traduzioni e note dei versi restano. */
export async function dropDraft(db: SinglishDB, songId: string): Promise<void> {
  await db.songs.update(songId, { askDraft: undefined })
}
