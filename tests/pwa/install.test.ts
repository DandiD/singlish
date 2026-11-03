import { describe, expect, test } from 'vitest'
import { installState, isIos } from '../../src/pwa/install'

const prompt = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' as const }) }

describe('installState', () => {
  test('già installata se gira in standalone', () => {
    expect(installState({ standalone: true, ios: true, prompt })).toBe('installed')
  })
  test('installabile se il browser ha offerto il prompt', () => {
    expect(installState({ standalone: false, ios: false, prompt })).toBe('available')
  })
  test('su iOS si spiegano i gesti di Safari', () => {
    expect(installState({ standalone: false, ios: true, prompt: null })).toBe('ios')
  })
  test('altrimenti non supportata dal browser', () => {
    expect(installState({ standalone: false, ios: false, prompt: null })).toBe('unsupported')
  })
})

describe('isIos', () => {
  test('riconosce iPhone e iPad (anche quello che si finge Mac)', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIos('Mozilla/5.0 (Linux; Android 15; Pixel 7)', 5)).toBe(false)
  })
})
