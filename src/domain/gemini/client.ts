export type GeminiErrorCode = 'no_key' | 'rate_limited' | 'http' | 'network' | 'bad_json'

export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message?: string,
    public status?: number,
  ) {
    super(message ?? code)
    this.name = 'GeminiError'
  }
}

export const RETRY_DELAYS_MS = [2000, 8000, 30000]

export interface GeminiRequest {
  apiKey: string
  model: string
  system: string
  user: string
  schema: object
}

export interface GeminiDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
}

export async function callGemini(req: GeminiRequest, deps: GeminiDeps): Promise<unknown> {
  if (!req.apiKey) throw new GeminiError('no_key')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey } as Record<string, string>,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: req.schema },
    }),
  }
  for (let attempt = 0; ; attempt++) {
    let failure: GeminiError
    let res: Response | undefined
    try {
      res = await deps.fetch(url, init)
    } catch {
      failure = new GeminiError('network', 'network error')
    }
    if (res) {
      if (res.ok) return parseBody(res)
      if (res.status === 429) failure = new GeminiError('rate_limited', 'rate limited', 429)
      else if (res.status >= 500) failure = new GeminiError('http', `http ${res.status}`, res.status)
      else throw new GeminiError('http', `http ${res.status}`, res.status)
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw failure!
    await deps.sleep(RETRY_DELAYS_MS[attempt])
  }
}

async function parseBody(res: Response): Promise<unknown> {
  try {
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') throw new Error('no text')
    return JSON.parse(text)
  } catch {
    throw new GeminiError('bad_json')
  }
}
