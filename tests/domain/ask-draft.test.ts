import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { askGemini, saveAnswers } from '../../src/domain/askDraft'
import type { AskAnswer } from '../../src/domain/askRequest'
import type { AskRequest } from '../../src/domain/askSelection'
import { GeminiError } from '../../src/domain/gemini/client'
import { saveSettings } from '../../src/domain/settings'
import type { Song } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const lines = ['I gave up on you, babe', "don't, you know", 'paper lanterns drift']
const song: Song = {
  id: 's1', kind: 'song', title: 'Paper Lanterns', artist: 'The Inventions', spotifyUrl: null, lines, status: 'studying', level: 'B2',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const fields = {
  type: 'phrasal_verb', cefr: 'B2', register: 'usable', topic: 'emotions',
  meaning_it: 'arrendersi', explanation_it: 'Smettere di provarci.', extra_example_en: 'He never gave up.', production_prompt_it: 'Quando ti arrendi.',
}
const wAns = (meaning = 'arrendersi', translationIt = 'Ho rinunciato a te'): AskAnswer => ({
  key: 'w:0:gave up', lineIndex: 0, text: 'gave up', translationIt,
  item: { item_type: 'chunk', base_form: 'give up', surface_form: 'gave up', widened: false, ...fields, meaning_it: meaning } as AskAnswer['item'],
  verse: null,
})
const vAns = (sense = 'Le lanterne vanno alla deriva.', translationIt = 'Le lanterne vanno alla deriva'): AskAnswer => ({
  key: 'v:2', lineIndex: 2, translationIt, item: null,
  verse: { sense_it: sense, grammar_it: null, culture_it: 'Immagine tradizionale', proposals: [] },
})
const v1: AskRequest = { id: 'v1', lineIndex: 2 }

describe('saveAnswers', () => {
  let db: SinglishDB
  beforeEach(async () => {
    db = createDb(`ask-draft-${Math.random()}`)
    await db.songs.add(song)
  })

  it('adds only missing translations, sorted by line', async () => {
    await db.songs.update('s1', { lineTranslations: [{ lineIndex: 0, textIt: 'vecchia' }] })
    await saveAnswers(db, 's1', { answers: [vAns('x', 'terza'), wAns('a', 'nuova')], unanswered: [] })
    expect((await db.songs.get('s1'))!.lineTranslations).toEqual([
      { lineIndex: 0, textIt: 'vecchia' },
      { lineIndex: 2, textIt: 'terza' },
    ])
  })

  it('stores a verse note and replaces the one for the same line', async () => {
    await saveAnswers(db, 's1', { answers: [vAns()], unanswered: [] })
    expect((await db.songs.get('s1'))!.lineNotes).toEqual([
      { lineIndex: 2, senseIt: 'Le lanterne vanno alla deriva.', grammarIt: null, cultureIt: 'Immagine tradizionale' },
    ])
    await saveAnswers(db, 's1', { answers: [vAns('Nuovo senso')], unanswered: [] })
    const notes = (await db.songs.get('s1'))!.lineNotes!
    expect(notes).toHaveLength(1)
    expect(notes[0].senseIt).toBe('Nuovo senso')
  })

  it('merges with an existing draft by key, new answers win', async () => {
    await saveAnswers(db, 's1', { answers: [wAns('arrendersi'), vAns()], unanswered: [] })
    const draft = await saveAnswers(db, 's1', { answers: [wAns('rinunciare')], unanswered: [] })
    expect(draft.answers).toHaveLength(2)
    expect(draft.answers.map((a) => a.key)).toEqual(['w:0:gave up', 'v:2'])
    expect((draft.answers[0].item as { meaning_it: string }).meaning_it).toBe('rinunciare')
    expect((await db.songs.get('s1'))!.askDraft).toEqual(draft)
  })

  it('a key that gets an answer leaves unanswered; new unanswered are added unless answered', async () => {
    await saveAnswers(db, 's1', { answers: [], unanswered: [v1] })
    expect((await db.songs.get('s1'))!.askDraft!.unanswered).toEqual([v1])
    const draft = await saveAnswers(db, 's1', { answers: [vAns()], unanswered: [] })
    expect(draft.unanswered).toEqual([])
    const again = await saveAnswers(db, 's1', { answers: [], unanswered: [v1] })
    expect(again.unanswered).toEqual([])
    expect(again.answers).toHaveLength(1)
  })

  it('orders answers by line, word before verse', async () => {
    const w2: AskAnswer = { ...wAns(), key: 'w:2:drift', lineIndex: 2, text: 'drift' }
    const draft = await saveAnswers(db, 's1', { answers: [vAns(), w2, wAns()], unanswered: [] })
    expect(draft.answers.map((a) => a.key)).toEqual(['w:0:gave up', 'w:2:drift', 'v:2'])
  })

  it('rejects and writes nothing when the song is gone', async () => {
    await db.songs.delete('s1')
    await expect(saveAnswers(db, 's1', { answers: [wAns()], unanswered: [] })).rejects.toThrow()
    expect(await db.songs.count()).toBe(0)
  })
})

describe('askGemini', () => {
  let db: SinglishDB
  beforeEach(async () => {
    db = createDb(`ask-draft-${Math.random()}`)
    await db.songs.add(song)
  })
  const ok = (x: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(x) }] } }] }), { status: 200 })
  const reply = {
    answers: [
      { id: 'w1', translation_it: 'Ho rinunciato a te', item: { item_type: 'chunk', base_form: 'give up', surface_form: 'gave up', widened: false, ...fields }, verse: null },
      { id: 'v1', translation_it: 'Le lanterne vanno alla deriva', item: null, verse: { sense_it: 'Deriva.', grammar_it: null, culture_it: null, proposals: [] } },
    ],
  }
  const requests: AskRequest[] = [{ id: 'w1', lineIndex: 0, text: 'gave up' }, v1]

  it('saves the draft on the song', async () => {
    await saveSettings(db, { apiKey: 'k' })
    const f = vi.fn(async () => ok(reply))
    const draft = await askGemini(db, 's1', requests, { fetch: f as unknown as typeof fetch, sleep: async () => {} })
    expect(draft.answers).toHaveLength(2)
    const saved = await db.songs.get('s1')
    expect(saved!.askDraft).toEqual(draft)
    expect(saved!.lineTranslations).toHaveLength(2)
    expect(saved!.lineNotes).toHaveLength(1)
  })

  it('without a key rejects with no_key', async () => {
    const f = vi.fn()
    await expect(askGemini(db, 's1', requests, { fetch: f as unknown as typeof fetch, sleep: async () => {} })).rejects.toMatchObject({ code: 'no_key' })
    await expect(askGemini(db, 's1', requests, { fetch: f as unknown as typeof fetch, sleep: async () => {} })).rejects.toBeInstanceOf(GeminiError)
  })
})
