import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync('src/styles/tokens.css', 'utf8')

function braceBody(start: number): string {
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error('unbalanced braces in tokens.css')
}

function block(selector: string): string {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`selector not found in tokens.css: ${selector}`)
  return braceBody(at)
}

const themes: Record<string, string> = {
  dark: block(':root, [data-theme="dark"]'),
  light: block('[data-theme="light"] {'),
  auto: braceBody(css.indexOf('[data-theme="auto"]')),
}

function vars(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const HUES = [1, 2, 3, 4, 5, 6]
const names = HUES.flatMap((n) => [`--song-${n}`, `--song-${n}-tint`])

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('song hue tokens', () => {
  test('every theme block defines song-1..6 and their tints', () => {
    for (const [theme, body] of Object.entries(themes)) {
      const v = vars(body)
      const missing = names.filter((n) => !/^#[0-9A-Fa-f]{6}$/.test(v[n] ?? ''))
      expect(missing, `theme "${theme}" is missing or has invalid: ${missing.join(', ')}`).toEqual([])
    }
  })

  test('auto-light block equals the light block', () => {
    const light = vars(themes.light)
    const auto = vars(themes.auto)
    for (const n of names) {
      expect(light[n], `${n} missing in light`).toBeDefined()
      expect(auto[n], `${n} differs between auto and light`).toBe(light[n])
    }
  })

  test('initials are readable on the cover tint', () => {
    for (const theme of ['dark', 'light']) {
      const v = vars(themes[theme])
      for (const n of HUES) {
        const ratio = contrast(v[`--song-${n}`], v[`--song-${n}-tint`])
        expect(
          ratio,
          `${theme} --song-${n} ${v[`--song-${n}`]} on tint ${v[`--song-${n}-tint`]}: contrast ${ratio.toFixed(2)} < 4.5`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
