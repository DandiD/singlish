export type GeminiErrorCode =
  | 'no_key'
  | 'bad_key' // chiave rifiutata (non valida, revocata, senza permessi)
  | 'bad_model' // il modello impostato non esiste
  | 'blocked' // Gemini ha bloccato il testo con i suoi filtri
  | 'rate_limited'
  | 'http'
  | 'network'
  | 'bad_json'

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
  /** false: un solo tentativo, senza le attese fra i ritentativi (per una prova interattiva). */
  retry?: boolean
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
      else throw await clientError(res)
    }
    if (deps.retry === false || attempt >= RETRY_DELAYS_MS.length) throw failure!
    await deps.sleep(RETRY_DELAYS_MS[attempt])
  }
}

/** Un 4xx diverso da 429: si distingue la chiave rifiutata e il modello inesistente. */
async function clientError(res: Response): Promise<GeminiError> {
  const s = res.status
  let body = ''
  try { body = await res.text() } catch { /* corpo illeggibile */ }
  if (s === 401 || s === 403 || (s === 400 && /API_KEY_INVALID|API key not valid/i.test(body))) {
    return new GeminiError('bad_key', `http ${s}`, s)
  }
  if (s === 404) return new GeminiError('bad_model', `http ${s}`, s)
  return new GeminiError('http', `http ${s}`, s)
}

const BLOCK_REASONS = ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']

async function parseBody(res: Response): Promise<unknown> {
  let data: { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: unknown }[] } }[] }
  try {
    data = await res.json()
  } catch {
    throw new GeminiError('bad_json')
  }
  const finish = data?.candidates?.[0]?.finishReason
  if (data?.promptFeedback?.blockReason || (finish && BLOCK_REASONS.includes(finish))) {
    throw new GeminiError('blocked', data?.promptFeedback?.blockReason ?? finish)
  }
  try {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string') throw new Error('no text')
    return JSON.parse(text)
  } catch {
    throw new GeminiError('bad_json')
  }
}
