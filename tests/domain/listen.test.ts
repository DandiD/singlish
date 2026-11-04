import { describe, expect, test } from 'vitest'
import { State } from 'ts-fsrs'
import { createDb } from '../../src/db/db'
import { gradeDictation } from '../../src/domain/text'
import { recordReview, newFsrsCard } from '../../src/domain/scheduler'
import type { Chunk, Song } from '../../src/db/types'

describe('dettato', () => {
  test('uguale (maiuscole, punteggiatura e contrazioni a parte) è Bene', () => {
    expect(gradeDictation("I'm gonna get it off my chest!", 'i am going to get it off my chest')).toMatchObject({ rating: 3, wrongWords: 0 })
  })
  test('una contrazione scritta senza apostrofo non conta come errore', () => {
    expect(gradeDictation("im gonna get it off my chest", "I'm gonna get it off my chest")).toMatchObject({ rating: 3, wrongWords: 0 })
  })
  test('una parola sbagliata o mancante è Difficile; di più è Di nuovo', () => {
    expect(gradeDictation('gonna get it of my chest', 'gonna get it off my chest').rating).toBe(2)
    expect(gradeDictation('gonna get it my chest', 'gonna get it off my chest').rating).toBe(2)
    expect(gradeDictation('gonna got off chest', 'gonna get it off my chest').rating).toBe(1)
  })
})

describe('sblocco della card Ascolta', () => {
  const now = new Date('2026-11-04T10:00:00Z')
  const song: Song = { id: 's1', kind: 'song', title: 'T', artist: '', spotifyUrl: null, lines: ['gonna get it off my chest'], status: 'studying', level: 'B2',
    difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
  const chunk = (note: string): Chunk => ({ id: 'c1', songId: 's1', key: 'k', baseForm: 'get it off my chest', surfaceForm: 'get it off my chest', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'usable', topic: 'emotions', meaningIt: 'sfogarsi', explanationIt: '',
    extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: note, userEdited: false, suspended: false })
  const graduate = async (c: Chunk, s: Song = song) => {
    const db = createDb('t-' + crypto.randomUUID())
    await db.songs.add(s); await db.chunks.add(c)
    await db.cards.add({ id: 'k1', itemType: 'chunk', itemId: 'c1', kind: 'C', unlocked: 1, due: now,
      fsrs: { ...newFsrsCard(now), state: State.Review, stability: 3, difficulty: 5, reps: 3, last_review: new Date(now.getTime() - 3 * 86400000), due: now }, goodRCount: 2 })
    await recordReview(db, 'k1', { rating: 3, auto: true, answer: 'x', elapsedMs: 1 }, now, 0.9)
    return db.cards.where('itemId').equals('c1').filter((k) => k.kind === 'A').count()
  }
  test('nasce per un chunk con nota di pronuncia', async () => {
    expect(await graduate(chunk('"get it off" suona ghe-ri-dof'))).toBe(1)
  })
  test('nasce per un chunk il cui verso ha parlato connesso', async () => {
    expect(await graduate(chunk(''), { ...song, connectedSpeech: [{ lineIndex: 0, written: 'going to', sung: 'gonna', noteIt: '' }] })).toBe(1)
  })
  test('non nasce se l\'ascolto non aggiunge nulla', async () => {
    expect(await graduate(chunk(''))).toBe(0)
  })
})
