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
})
