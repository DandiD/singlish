import { describe, expect, it, vi } from 'vitest'
import { ASK_SCHEMA, ASK_SYSTEM_PROMPT, buildAskMessage, checkAnswers, requestAnswers } from '../../src/domain/askRequest'
import type { AskRequest } from '../../src/domain/askSelection'
import { GeminiError } from '../../src/domain/gemini/client'

const lines = ['I gave up on you, babe', "don't, you know", 'paper lanterns drift']
const requests: AskRequest[] = [
  { id: 'w1', lineIndex: 0, text: 'gave up' },
  { id: 'v1', lineIndex: 2 },
]

const fields = {
  type: 'phrasal_verb', cefr: 'B2', register: 'usable', topic: 'emotions',
  meaning_it: 'arrendersi', explanation_it: 'Smettere di provarci.', extra_example_en: 'He never gave up.', production_prompt_it: 'Quando ti arrendi.',
}
const item = (over: Record<string, unknown> = {}) => ({ item_type: 'chunk', base_form: 'give up', surface_form: 'gave up', widened: false, ...fields, ...over })
const proposal = (base: string) => ({ base_form: base, ...fields })
const verse = (proposals: unknown[] = []) => ({ sense_it: 'Le lanterne vanno alla deriva.', grammar_it: null, culture_it: null, proposals })
const wAnswer = (over: Record<string, unknown> = {}) => ({ id: 'w1', translation_it: 'Ho rinunciato a te, tesoro', item: item(), verse: null, ...over })
const vAnswer = (over: Record<string, unknown> = {}) => ({ id: 'v1', translation_it: 'Le lanterne di carta vanno alla deriva', item: null, verse: verse(), ...over })

describe('buildAskMessage', () => {
  const base = { kind: 'song' as const, title: 'Paper Lanterns', artist: 'The Inventions', level: 'B2' as const, lines, requests }
  it('lists song, title, numbered lines and requests', () => {
    const m = buildAskMessage(base)
    expect(m).toContain('Tipo: canzone')
    expect(m).toContain('Titolo: Paper Lanterns — The Inventions')
    expect(m).toContain('Livello: B2')
    expect(m).toContain('0: I gave up on you')
    expect(m).toContain('Richieste:\nw1 · riga 0 · "gave up"\nv1 · riga 2')
  })
  it('free text without title omits the title line', () => {
    const m = buildAskMessage({ ...base, kind: 'text', title: '', artist: '' })
    expect(m).toContain('Tipo: testo libero (non una canzone)')
    expect(m).not.toContain('Titolo:')
  })
  it('omits the artist when empty', () => {
    expect(buildAskMessage({ ...base, artist: '' })).toContain('Titolo: Paper Lanterns\n')
  })
})

describe('prompt and schema', () => {
  it('prompt has the key rules', () => {
    expect(ASK_SYSTEM_PROMPT).toContain('esattamente una volta')
    expect(ASK_SYSTEM_PROMPT).toContain('Non è mai vuota')
    expect(ASK_SYSTEM_PROMPT).toContain('widened')
  })
  it('schema requires all four answer fields', () => {
    expect(ASK_SCHEMA.properties.answers.items.required).toEqual(['id', 'translation_it', 'item', 'verse'])
  })
})

describe('checkAnswers', () => {
  it('accepts complete answers, taking line and text from the request', () => {
    const { answers, missing } = checkAnswers({ answers: [wAnswer({ line_index: 9 }), vAnswer({ line_index: 9 })] }, requests)
    expect(missing).toEqual([])
    expect(answers.map((a) => a.key)).toEqual(['w:0:gave up', 'v:2'])
    expect(answers.map((a) => a.lineIndex)).toEqual([0, 2])
    expect(answers[0].text).toBe('gave up')
    expect(answers[1].verse?.sense_it).toBeTruthy()
  })
  it('blank translation is missing', () => {
    const { answers, missing } = checkAnswers({ answers: [wAnswer({ translation_it: '  ' }), vAnswer()] }, requests)
    expect(answers).toHaveLength(1)
    expect(missing.map((r) => r.id)).toEqual(['w1'])
  })
  it('trims the translation', () => {
    expect(checkAnswers({ answers: [wAnswer({ translation_it: '  ciao  ' })] }, [requests[0]]).answers[0].translationIt).toBe('ciao')
  })
  it('wrong field for the id is missing', () => {
    const { missing } = checkAnswers({ answers: [wAnswer(), vAnswer({ item: item() })] }, requests)
    expect(missing.map((r) => r.id)).toEqual(['v1'])
  })
  it('word with a chunk type is missing', () => {
    const { missing } = checkAnswers({ answers: [wAnswer({ item: item({ item_type: 'word', type: 'idiom' }) }), vAnswer()] }, requests)
    expect(missing.map((r) => r.id)).toEqual(['w1'])
  })
  it('accepts a word with a part of speech', () => {
    const { answers } = checkAnswers({ answers: [wAnswer({ item: item({ item_type: 'word', type: 'verb', base_form: 'give' }) })] }, [requests[0]])
    expect(answers).toHaveLength(1)
  })
  it('ignores unknown ids and keeps the first complete answer', () => {
    const { answers, missing } = checkAnswers(
      { answers: [{ ...wAnswer(), id: 'w9' }, wAnswer({ translation_it: '' }), wAnswer({ translation_it: 'seconda' }), vAnswer()] },
      requests,
    )
    expect(missing).toEqual([])
    expect(answers).toHaveLength(2)
    expect(answers[0].translationIt).toBe('seconda')
  })
  it('drops proposals equal to the item, and keeps at most two', () => {
    const v = verse([proposal('Give  up'), proposal('drift away'), proposal('hold on'), proposal('let go')])
    const { answers } = checkAnswers({ answers: [wAnswer({ item: item({ base_form: 'give up' }) , verse: null }), vAnswer({ verse: v })] }, requests)
    expect(answers[1].verse?.proposals.map((p) => p.base_form)).toEqual(['drift away', 'hold on'])
  })
  it('throws bad_json without an answers array', () => {
    for (const raw of [{}, null, { answers: 'x' }]) {
      try {
        checkAnswers(raw, requests)
        expect.unreachable()
      } catch (e) {
        expect(e).toBeInstanceOf(GeminiError)
        expect((e as GeminiError).code).toBe('bad_json')
      }
    }
  })
})

describe('requestAnswers', () => {
  const input = { kind: 'song' as const, title: 'Paper Lanterns', artist: 'The Inventions', level: 'B2' as const, lines, requests }
  const gemini = { apiKey: 'k', model: 'm' }
  const ok = (x: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(x) }] } }] }), { status: 200 })
  const run = (responses: Response[]) => {
    const f = vi.fn(async () => responses.shift() ?? new Response('{}', { status: 500 }))
    const deps = { fetch: f as unknown as typeof fetch, sleep: async () => {} }
    return { f, go: () => requestAnswers(input, gemini, deps) }
  }
  const bodyOf = (f: ReturnType<typeof vi.fn>, n: number) => String((f.mock.calls[n] as unknown[])[1] && ((f.mock.calls[n] as unknown[])[1] as { body: string }).body)

  it('one call when everything is answered', async () => {
    const { f, go } = run([ok({ answers: [wAnswer(), vAnswer()] })])
    const r = await go()
    expect(f).toHaveBeenCalledTimes(1)
    expect(r.unanswered).toEqual([])
    expect(r.answers).toHaveLength(2)
  })
  it('asks once more for the missing ones only, result ordered like the requests', async () => {
    const { f, go } = run([ok({ answers: [wAnswer()] }), ok({ answers: [vAnswer()] })])
    const r = await go()
    expect(f).toHaveBeenCalledTimes(2)
    expect(bodyOf(f, 1)).toContain('v1 · riga 2')
    expect(bodyOf(f, 1)).not.toContain('w1 ·')
    expect(r.answers.map((a) => a.key)).toEqual(['w:0:gave up', 'v:2'])
    expect(r.unanswered).toEqual([])
  })
  it('still missing after the second call: unanswered, no third call', async () => {
    const { f, go } = run([ok({ answers: [wAnswer()] }), ok({ answers: [] })])
    const r = await go()
    expect(f).toHaveBeenCalledTimes(2)
    expect(r.unanswered).toEqual([{ id: 'v1', lineIndex: 2 }])
  })
  it('second call failing with 400 keeps the first answers', async () => {
    const { go } = run([ok({ answers: [wAnswer()] }), new Response('{}', { status: 400 })])
    const r = await go()
    expect(r.unanswered.map((q) => q.id)).toEqual(['v1'])
    expect(r.answers.map((a) => a.key)).toEqual(['w:0:gave up'])
  })
  it('first call failing with 400 rejects', async () => {
    const { go } = run([new Response('{}', { status: 400 })])
    await expect(go()).rejects.toBeInstanceOf(GeminiError)
  })
})
