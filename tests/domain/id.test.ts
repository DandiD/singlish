import { afterEach, expect, test, vi } from 'vitest'
import { newId } from '../../src/domain/id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.restoreAllMocks())

test('genera UUID v4 diversi', () => {
  const a = newId()
  expect(a).toMatch(UUID_V4)
  expect(newId()).not.toBe(a)
})

test('funziona anche senza crypto.randomUUID (pagina http in rete locale, contesto non sicuro)', () => {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  } finally {
    delete (crypto as unknown as Record<string, unknown>).randomUUID
  }
})
