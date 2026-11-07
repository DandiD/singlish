import type { SinglishDB } from '../db/db'
import type { AskDraft, LineNote } from '../db/types'
import { answerKey, requestAnswers, type AskAnswer } from './askRequest'
import type { AskRequest } from './askSelection'
import { getSettings } from './settings'

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
    { kind: song.kind, title: song.title, artist: song.artist, level: settings.level, lines: song.lines, requests },
    { apiKey: settings.apiKey, model: settings.model },
    deps,
  )
  return saveAnswers(db, songId, result)
}
