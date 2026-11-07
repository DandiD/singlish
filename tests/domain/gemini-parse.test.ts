import { describe, expect, test } from 'vitest'
import fixtureJson from '../fixtures/analysis.json'
import { buildUserMessage, RESPONSE_SCHEMA, SYSTEM_PROMPT } from '../../src/domain/gemini/prompt'
import { parseAnalysis } from '../../src/domain/gemini/parse'
import { GeminiError } from '../../src/domain/gemini/client'

const fixture = fixtureJson as any

describe('gemini prompt', () => {
  test('prompt lists numbered lines and known items', () => {
    const m = buildUserMessage({ level: 'B2', band: [3000, 8000], known: ['figure out'], lines: ['a', 'b'] })
    expect(m).toContain('Livello: B2')
    expect(m).toContain('Fascia di frequenza: 3000-8000')
    expect(m).toContain('0: a\n1: b')
    expect(m).toContain('figure out')
  })
  test('known list is capped at 300', () => {
    const known = Array.from({ length: 400 }, (_, i) => `k${i}`)
    const m = buildUserMessage({ level: 'B1', band: [2000, 5000], known, lines: ['a'] })
    expect(m).toContain('k299')
    expect(m).not.toContain('k300')
  })
  test('system prompt is the spec text', () => {
    expect(SYSTEM_PROMPT.startsWith('Sei un insegnante di inglese madrelingua')).toBe(true)
    expect(SYSTEM_PROMPT.endsWith('dillo.')).toBe(true)
  })
  test('schema required lists', () => {
    const s: any = RESPONSE_SCHEMA
    expect(s.type).toBe('OBJECT')
    expect(s.required).toEqual(['difficulty_known_pct', 'grammar_point', 'connected_speech', 'chunks', 'words', 'line_translations'])
    const chunk = s.properties.chunks.items
    expect(chunk.required).toEqual(Object.keys(chunk.properties).filter((k) => k !== 'pronunciation_note_it'))
    expect(chunk.properties.type.enum).toContain('phrasal_verb')
    const word = s.properties.words.items
    expect(word.required).toEqual(Object.keys(word.properties))
    expect(word.properties.pos.enum).toContain('noun')
  })
})

describe('parseAnalysis', () => {
  test('parses fixture', () => {
    const a = parseAnalysis(fixture, 10)
    expect(a.chunks).toHaveLength(3)
    expect(a.words).toHaveLength(3)
  })
  test('drops out-of-range lines and duplicates', () => {
    const bad = structuredClone(fixture)
    bad.chunks.push({ ...bad.chunks[0], line_index: 99 })
    bad.chunks.push({ ...bad.chunks[0], base_form: bad.chunks[0].base_form.toUpperCase() })
    bad.words.push({ ...bad.words[0], lemma: bad.words[0].lemma.toUpperCase() })
    bad.words.push({ ...bad.words[1], line_index: -1 })
    bad.connected_speech.push({ ...bad.connected_speech[0], line_index: 50 })
    bad.difficulty_known_pct = 140
    const a = parseAnalysis(bad, 10)
    expect(a.chunks).toHaveLength(3)
    expect(a.words).toHaveLength(3)
    expect(a.connected_speech).toHaveLength(2)
    expect(a.difficulty_known_pct).toBe(100)
  })
  test('clamps low and rounds pct', () => {
    expect(parseAnalysis({ ...fixture, difficulty_known_pct: -5 }, 10).difficulty_known_pct).toBe(0)
    expect(parseAnalysis({ ...fixture, difficulty_known_pct: 70.6 }, 10).difficulty_known_pct).toBe(71)
  })
  test('out-of-range grammar point becomes null', () => {
    const a = parseAnalysis({ ...fixture, grammar_point: { ...fixture.grammar_point, line_index: 77 } }, 10)
    expect(a.grammar_point).toBeNull()
  })
  test('rejects garbage', () => {
    expect(() => parseAnalysis({ foo: 1 }, 10)).toThrow(GeminiError)
    try { parseAnalysis(null, 10) } catch (e) { expect((e as GeminiError).code).toBe('bad_json') }
  })

  test('traduzioni dei versi: tenute solo per righe valide, non vuote, una per riga', () => {
    const f = structuredClone(fixture)
    f.line_translations = [
      { line_index: 3, translation_it: '  Ho capito che non saresti mai venuto  ' },
      { line_index: 3, translation_it: 'doppione' },
      { line_index: 99, translation_it: 'fuori dal testo' },
      { line_index: 4, translation_it: '   ' },
    ]
    expect(parseAnalysis(f, 10).line_translations).toEqual([{ line_index: 3, translation_it: 'Ho capito che non saresti mai venuto' }])
  })
  test('una risposta senza traduzioni resta valida', () => {
    const old = structuredClone(fixture)
    delete old.line_translations
    expect(parseAnalysis(old, 10).line_translations).toEqual([])
  })
})

describe('traduzione dei versi nel prompt', () => {
  test('lo schema chiede le traduzioni dei versi', () => {
    expect(RESPONSE_SCHEMA.required).toContain('line_translations')
    expect(RESPONSE_SCHEMA.properties.line_translations.items.required).toEqual(['line_index', 'translation_it'])
  })
  test('il prompt chiede di tradurre solo le righe con un elemento estratto', () => {
    expect(SYSTEM_PROMPT).toContain('Traduci in italiano solo le righe che contengono un chunk, una parola o un fenomeno di parlato connesso')
    expect(SYSTEM_PROMPT).not.toContain('Non tradurre il testo intero.')
  })
})
