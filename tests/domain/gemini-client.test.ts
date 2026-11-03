import { describe, expect, test, vi } from 'vitest'
import { callGemini } from '../../src/domain/gemini/client'

const req = { apiKey: 'k', model: 'm', system: 's', user: 'u', schema: {} }
const sleep = vi.fn().mockResolvedValue(undefined)
const deps = { fetch: vi.fn() as unknown as typeof fetch, sleep }
const okBody = { candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }
const resp = (body: string, status = 200) => () => Promise.resolve(new Response(body, { status }))

describe('callGemini', () => {
  test('no key fails fast', async () => {
    await expect(callGemini({ ...req, apiKey: '' }, deps)).rejects.toMatchObject({ code: 'no_key' })
  })
  test('sends key header and returns parsed json', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(okBody)))
    expect(await callGemini(req, { fetch: f, sleep })).toEqual({ x: 1 })
    expect(f.mock.calls[0][1].headers['x-goog-api-key']).toBe('k')
    expect(JSON.parse(f.mock.calls[0][1].body).generationConfig.temperature).toBe(0.2)
  })
  test('retries 429 with 2s, 8s, 30s then fails', async () => {
    const f = vi.fn().mockImplementation(resp('', 429))
    const s = vi.fn().mockResolvedValue(undefined)
    await expect(callGemini(req, { fetch: f, sleep: s })).rejects.toMatchObject({ code: 'rate_limited' })
    expect(s.mock.calls.map(c => c[0])).toEqual([2000, 8000, 30000]); expect(f).toHaveBeenCalledTimes(4)
  })
  test('does not retry 400', async () => {
    const f = vi.fn().mockImplementation(resp('', 400))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'http', status: 400 })
    expect(f).toHaveBeenCalledTimes(1)
  })
  test('network error after retries', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('offline'))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'network' })
    expect(f).toHaveBeenCalledTimes(4)
  })
  test('5xx retried then http 503', async () => {
    const f = vi.fn().mockImplementation(resp('', 503))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'http', status: 503 })
    expect(f).toHaveBeenCalledTimes(4)
  })
  test('429 then 200 recovers', async () => {
    const f = vi.fn().mockImplementationOnce(resp('', 429)).mockImplementation(resp(JSON.stringify(okBody)))
    expect(await callGemini(req, { fetch: f, sleep })).toEqual({ x: 1 })
    expect(f).toHaveBeenCalledTimes(2)
  })
  test('missing text or invalid json is bad_json without retry', async () => {
    const f = vi.fn().mockImplementation(resp('{}'))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'bad_json' })
    expect(f).toHaveBeenCalledTimes(1)
    const g = vi.fn().mockImplementation(resp(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nope' }] } }] })))
    await expect(callGemini(req, { fetch: g, sleep })).rejects.toMatchObject({ code: 'bad_json' })
  })

  test('chiave rifiutata: 400 API_KEY_INVALID, 401 e 403 diventano bad_key senza ritentare', async () => {
    const invalid = JSON.stringify({ error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })
    for (const [body, status] of [[invalid, 400], ['{}', 401], ['{"error":{"status":"PERMISSION_DENIED"}}', 403]] as const) {
      const f = vi.fn().mockImplementation(resp(body, status))
      await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'bad_key', status })
      expect(f).toHaveBeenCalledTimes(1)
    }
  })
  test('modello inesistente: 404 diventa bad_model', async () => {
    const f = vi.fn().mockImplementation(resp('{"error":{"code":404,"status":"NOT_FOUND"}}', 404))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'bad_model', status: 404 })
  })
  test('un 400 qualsiasi resta http', async () => {
    const f = vi.fn().mockImplementation(resp('{"error":{"status":"INVALID_ARGUMENT","message":"bad schema"}}', 400))
    await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'http', status: 400 })
  })
  test('testo bloccato dai filtri di Gemini: blocked', async () => {
    const bodies = [
      { promptFeedback: { blockReason: 'SAFETY' } },
      { candidates: [{ finishReason: 'SAFETY' }] },
      { candidates: [{ finishReason: 'RECITATION', content: { parts: [] } }] },
    ]
    for (const b of bodies) {
      const f = vi.fn().mockImplementation(resp(JSON.stringify(b)))
      await expect(callGemini(req, { fetch: f, sleep })).rejects.toMatchObject({ code: 'blocked' })
    }
  })
  test('retry: false prova una volta sola (per la prova della chiave)', async () => {
    const f = vi.fn().mockImplementation(resp('', 429))
    const s = vi.fn().mockResolvedValue(undefined)
    await expect(callGemini(req, { fetch: f, sleep: s, retry: false })).rejects.toMatchObject({ code: 'rate_limited' })
    expect(f).toHaveBeenCalledTimes(1)
    expect(s).not.toHaveBeenCalled()
  })
})
