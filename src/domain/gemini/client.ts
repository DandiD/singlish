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
