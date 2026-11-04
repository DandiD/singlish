import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb, type SinglishDB } from '../../src/db/db'
import { requestExpansion, addExpansion, EXPAND_SCHEMA, type Expansion } from '../../src/domain/expand'
import { buildSessionQueue } from '../../src/domain/queue'
import { saveSettings } from '../../src/domain/settings'
import { newCardPair } from '../../src/domain/scheduler'
import type { Song, Word } from '../../src/db/types'

const now = new Date('2026-11-04T10:00:00Z')
const song: Song = { id: 's1', kind: 'song', title: 'Running On Empty', artist: '', spotifyUrl: null, lines: ['running on empty'], status: 'studying', level: 'B1',
  difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now }
const word: Word = { id: 'w1', lemma: 'empty', surfaceForm: 'empty', pos: 'adjective', freqRank: 2000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
  cefr: 'B1', register: 'usable', topic: 'other', meaningIt: 'vuoto', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false }
const expansion: Expansion = {
  family: [{ lemma: 'emptiness', pos: 'noun', meaning_it: 'vuoto, senso di vuoto', example_en: 'A feeling of emptiness.' }],
  collocations: [{ base_form: 'empty promises', meaning_it: 'promesse vuote', example_en: 'No more empty promises.' }],
  opposites: [{ lemma: 'full', pos: 'adjective', meaning_it: 'pieno', example_en: 'The bus was full.' }],
  nuance: { options: ['empty', 'vacant', 'hollow'], answer: 'vacant', situation_it: "Scrivi un annuncio: l'appartamento è libero da subito.",
    sentence_en: 'The flat is ____ from today.', explanation_it: 'Vacant è il termine da annunci: libero, non occupato.', summary_it: 'libero, vuoto dentro: quando usare quale' },
}
const reply = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expansion) }] } }] })))
let db: SinglishDB
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await saveSettings(db, { apiKey: 'k' })
  await db.songs.add(song); await db.words.add(word); await db.cards.bulkAdd(newCardPair('word', 'w1', now))
})

describe('espandi una parola', () => {
  test('una chiamata, poi il risultato resta salvato: riaprire non chiama di nuovo', async () => {
    const f = reply()
    expect(await requestExpansion(db, 'w1', { fetch: f as unknown as typeof fetch, sleep: async () => {} })).toEqual(expansion)
    expect(await requestExpansion(db, 'w1', { fetch: f as unknown as typeof fetch, sleep: async () => {} })).toEqual(expansion)
    expect(f).toHaveBeenCalledTimes(1)
    expect(EXPAND_SCHEMA.required).toEqual(['family', 'collocations', 'opposites', 'nuance'])
  })
  test('le voci scelte entrano nel ripasso; la sfumatura crea la card S sulla parola', async () => {
    await requestExpansion(db, 'w1', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
    const n = await addExpansion(db, 'w1', { family: ['emptiness'], collocations: ['empty promises'], opposites: [], nuance: true }, now)
    expect(n).toBe(5) // 2 card per la parola, 2 per la collocazione, 1 Sfumature
    const added = (await db.words.toArray()).find((w) => w.lemma === 'emptiness')!
    expect(added).toMatchObject({ triage: 'learn', origin: 'expand', extraExampleEn: 'A feeling of emptiness.', contexts: [] })
    const coll = (await db.chunks.toArray())[0]
    expect(coll).toMatchObject({ baseForm: 'empty promises', type: 'collocation', origin: 'expand' })
    expect(await db.cards.where('itemId').equals('w1').filter((c) => c.kind === 'S').count()).toBe(1)
    expect((await db.words.get('w1'))!.nuance).toMatchObject({ answer: 'vacant' })
  })
  test('le espansioni entrano nella coda dopo chunk e parole delle canzoni', async () => {
    await requestExpansion(db, 'w1', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
    await addExpansion(db, 'w1', { family: ['emptiness'], collocations: ['empty promises'], opposites: ['full'], nuance: false }, now)
    const q = await buildSessionQueue(db, now)
    const order = q.items.map((i) => i.card.itemId)
    const origin = await db.words.get('w1')
    expect(order[0]).toBe(origin!.id)
  })
  test('una voce già presente non si duplica', async () => {
    await requestExpansion(db, 'w1', { fetch: reply() as unknown as typeof fetch, sleep: async () => {} })
    await addExpansion(db, 'w1', { family: ['emptiness'], collocations: [], opposites: [], nuance: false }, now)
    expect(await addExpansion(db, 'w1', { family: ['emptiness'], collocations: [], opposites: [], nuance: false }, now)).toBe(0)
    expect((await db.words.toArray()).filter((w) => w.lemma === 'emptiness')).toHaveLength(1)
  })
})
