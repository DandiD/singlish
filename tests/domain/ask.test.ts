import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { tokenize, groupSelection, buildAskMessage, ASK_SCHEMA, ASK_SYSTEM_PROMPT, askGemini } from '../../src/domain/ask'
import { saveSettings } from '../../src/domain/settings'
import type { Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const lines = ['We dropped the ball on this one', 'now we scramble to catch up', "it's all uphill from here"]
const song: Song = {
  id: 's1', kind: 'song', title: 'T', artist: '', spotifyUrl: null, lines, status: 'studying', level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}

describe('selezione nel testo', () => {
  test('le parole di un verso, con la loro posizione', () => {
    expect(tokenize("it's all uphill").map((t) => t.text)).toEqual(["it's", 'all', 'uphill'])
  })
  test('parole vicine sulla stessa riga diventano una sola espressione; righe diverse restano separate', () => {
    expect(groupSelection(lines, new Set(['0:1', '0:2', '0:3', '1:2', '2:2']))).toEqual([
      { lineIndex: 0, text: 'dropped the ball' },
      { lineIndex: 1, text: 'scramble' },
      { lineIndex: 2, text: 'uphill' },
    ])
  })
  test('parole non vicine sulla stessa riga restano separate', () => {
    expect(groupSelection(lines, new Set(['1:2', '1:5']))).toEqual([{ lineIndex: 1, text: 'scramble' }, { lineIndex: 1, text: 'up' }])
  })
})

describe('richiesta a Gemini', () => {
  test('il messaggio contiene il testo numerato e solo le voci segnate', () => {
    const m = buildAskMessage({ level: 'B2', lines, picks: [{ lineIndex: 0, text: 'dropped the ball' }] })
    expect(m).toContain('0: We dropped the ball on this one')
    expect(m).toContain('Segnate dallo studente:\n0: dropped the ball')
    expect(ASK_SYSTEM_PROMPT).toContain('una sola volta')
    expect(ASK_SCHEMA.required).toEqual(['chunks', 'words', 'line_translations'])
  })
})

describe('salvataggio delle risposte', () => {
  let db: SinglishDB
  const answer = {
    chunks: [{ base_form: 'drop the ball', surface_form: 'dropped the ball', line_index: 0, type: 'idiom', cefr: 'B2', register: 'informal', topic: 'work',
      meaning_it: 'fare un errore, mancare un impegno', explanation_it: 'Sbagliare per distrazione.', extra_example_en: 'I dropped the ball on that email.', production_prompt_it: 'Ammetti un errore.' }],
    words: [{ lemma: 'scramble', surface_form: 'scramble', line_index: 1, pos: 'verb', cefr: 'C1', register: 'usable', topic: 'time',
      meaning_it: 'affannarsi', explanation_it: 'Muoversi in fretta e in disordine.', extra_example_en: 'We scrambled to finish.' }],
    line_translations: [{ line_index: 0, translation_it: 'Abbiamo sbagliato questa volta' }],
  }
  const reply = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] })))
  const deps = (f: ReturnType<typeof reply>) => ({ fetch: f as unknown as typeof fetch, sleep: async () => {}, now })
  const picks = [{ lineIndex: 0, text: 'dropped the ball' }, { lineIndex: 1, text: 'scramble' }]
  const knownScramble: Word = { id: 'w', lemma: 'scramble', surfaceForm: 'scramble', pos: 'verb', freqRank: 9000, songId: 's1', lineIndex: 1,
    contexts: [{ songId: 's1', lineIndex: 1 }], cefr: 'C1', register: 'usable', topic: 'time', meaningIt: 'x', explanationIt: '', extraExampleEn: '',
    triage: 'known', userEdited: false, suspended: false }
  beforeEach(async () => {
    db = createDb('t-' + crypto.randomUUID())
    await saveSettings(db, { apiKey: 'k' })
    await db.songs.add(song)
  })

  test('una sola chiamata; chunk e parole entrano subito nel ripasso, con la traduzione del verso', async () => {
    const f = reply()
    expect(await askGemini(db, 's1', picks, deps(f))).toEqual({ added: 2, existing: 0 })
    expect(f).toHaveBeenCalledTimes(1)
    expect((await db.chunks.toArray())[0]).toMatchObject({ baseForm: 'drop the ball', surfaceForm: 'dropped the ball', contexts: [{ songId: 's1', lineIndex: 0 }] })
    expect((await db.words.toArray())[0]).toMatchObject({ lemma: 'scramble', triage: 'learn' })
    expect(await db.cards.count()).toBe(4)
    expect((await db.songs.get('s1'))!.lineTranslations).toEqual([{ lineIndex: 0, textIt: 'Abbiamo sbagliato questa volta' }])
  })

  test('una parola già nota passa in studio con le sue card; chiedendo di nuovo non si duplica nulla', async () => {
    await db.words.add(knownScramble)
    expect(await askGemini(db, 's1', picks, deps(reply()))).toEqual({ added: 1, existing: 1 })
    expect((await db.words.get('w'))!.triage).toBe('learn')
    expect(await db.cards.where('itemId').equals('w').count()).toBe(2)
    expect(await askGemini(db, 's1', picks, deps(reply()))).toEqual({ added: 0, existing: 2 })
    expect(await db.chunks.count()).toBe(1)
    expect(await db.words.count()).toBe(1)
    expect(await db.cards.count()).toBe(4)
  })

  test('niente da chiedere: nessuna chiamata', async () => {
    const f = reply()
    expect(await askGemini(db, 's1', [], deps(f))).toEqual({ added: 0, existing: 0 })
    expect(f).not.toHaveBeenCalled()
  })
})
