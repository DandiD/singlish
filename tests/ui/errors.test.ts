import { describe, expect, test } from 'vitest'
import { actionMessage, geminiProblem, storageProblem } from '../../src/ui/errors'
import { GeminiError } from '../../src/domain/gemini/client'

/** Un messaggio ben formato: titolo senza punto finale, testo in frasi complete, nessun codice grezzo. */
function wellFormed(p: { title: string; text: string }) {
  expect(p.title).toMatch(/^[A-ZÈ]/)
  expect(p.title).not.toMatch(/[.!]$/)
  expect(p.text).toMatch(/^[A-ZÈ«]/)
  expect(p.text).toMatch(/\.$/)
  for (const s of [p.title, p.text]) {
    expect(s).not.toMatch(/undefined|null|NaN|\[object|Error:|bad_json|rate_limited|API_KEY/)
    expect(s).not.toMatch(/ {2}/)
  }
}

describe('messaggi per gli errori di Gemini', () => {
  const cases: [GeminiError, RegExp, 'settings' | 'retry'][] = [
    [new GeminiError('no_key'), /Manca la chiave/, 'settings'],
    [new GeminiError('bad_key', 'http 400', 400), /chiave .*non funziona/i, 'settings'],
    [new GeminiError('bad_model', 'http 404', 404), /modello «gemini-x» non esiste/, 'settings'],
    [new GeminiError('blocked', 'RECITATION'), /ha fermato la richiesta/, 'retry'],
    [new GeminiError('bad_json'), /incompleta/, 'retry'],
    [new GeminiError('rate_limited', 'rate limited', 429), /occupato/, 'retry'],
    [new GeminiError('network'), /non risponde/, 'retry'],
    [new GeminiError('http', 'http 503', 503), /non risponde/, 'retry'],
    [new GeminiError('http', 'http 400', 400), /rifiutato la richiesta/, 'retry'],
  ]
  for (const [e, title, fix] of cases) {
    test(`${e.code} ${e.status ?? ''}`, () => {
      const p = geminiProblem(e, 'gemini-x')
      expect(p.title).toMatch(title)
      expect(p.fix).toBe(fix)
      wellFormed(p)
    })
  }
  test('il modello predefinito è suggerito quando quello impostato non esiste', () => {
    expect(geminiProblem(new GeminiError('bad_model'), 'gemini-x').text).toContain('gemini-flash-lite-latest')
  })
  test('lo status HTTP compare in chiaro solo dove serve', () => {
    expect(geminiProblem(new GeminiError('http', 'http 503', 503), 'm').text).toContain('errore 503')
  })
  test('un errore qualsiasi ha comunque un messaggio', () => {
    const p = geminiProblem(new TypeError('x is undefined'), 'm')
    wellFormed(p)
    expect(p.fix).toBe('retry')
  })
})

describe('errori dei dati salvati sul dispositivo', () => {
  test('spazio esaurito, anche avvolto da Dexie', () => {
    const quota = Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    const wrapped = Object.assign(new Error('Dexie'), { name: 'AbortError', inner: quota })
    for (const e of [quota, wrapped]) {
      const p = storageProblem(e)!
      expect(p.title).toMatch(/Spazio/)
      wellFormed(p)
    }
  })
  test('database che non si apre (navigazione privata, dati bloccati)', () => {
    for (const name of ['OpenFailedError', 'MissingAPIError', 'DatabaseClosedError', 'InvalidStateError', 'VersionError', 'SecurityError', 'UnknownError']) {
      const p = storageProblem(Object.assign(new Error('x'), { name }))!
      expect(p.title).toMatch(/dati dell'app/)
      wellFormed(p)
    }
  })
  test('un errore che non c\'entra con i dati non è un problema di spazio', () => {
    expect(storageProblem(new TypeError('boom'))).toBeNull()
  })
  test('il messaggio di un\'azione fallita dice cosa fare', () => {
    expect(actionMessage(new TypeError('boom'))).toMatch(/^Non salvato\. .*Riprova/)
    expect(actionMessage(Object.assign(new Error(), { name: 'QuotaExceededError' }))).toMatch(/^Spazio esaurito\./)
  })
})
