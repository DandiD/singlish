import { readFileSync } from 'node:fs'
import { afterEach, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/preact'
import { RatingSegments } from '../../src/ui/components/RatingSegments'

afterEach(cleanup)

test('one span per segment with kind class, current ring and glow', () => {
  const { container } = render(
    <RatingSegments segments={['done', 'full', 'half', 'empty', 'written', 'todo']} current={5} glow={[1]} label="Voti finora: 1 Bene o Facile" />,
  )
  const group = container.querySelector('[role="img"]')!
  expect(group.getAttribute('aria-label')).toBe('Voti finora: 1 Bene o Facile')
  const segs = [...group.querySelectorAll('span.seg')]
  expect(segs.map((s) => [...s.classList].find((c) => c.startsWith('seg-') && c !== 'seg-current' && c !== 'seg-glow'))).toEqual(
    ['seg-done', 'seg-full', 'seg-half', 'seg-empty', 'seg-written', 'seg-todo'],
  )
  expect(segs.map((s) => s.classList.contains('seg-current'))).toEqual([false, false, false, false, false, true])
  expect(segs.map((s) => s.classList.contains('seg-glow'))).toEqual([false, true, false, false, false, false])
})

const read = (f: string) => readFileSync(`src/styles/${f}`, 'utf8')
const rule = (css: string, sel: string) => {
  const m = css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`rule not found: ${sel}`)
  return m[1]
}

test('long sessions stay on one row: flexible width, at least 2px', () => {
  const body = rule(read('base.css'), '.seg')
  expect(body).toMatch(/flex:\s*1 1 0/)
  expect(body).toMatch(/min-width:\s*2px/)
})

test('reduced motion switches off segment and glow animations', () => {
  const css = read('motion.css')
  const at = css.indexOf('/* ---------- Segmenti')
  expect(at).toBeGreaterThan(-1)
  const tail = css.slice(at)
  const reduce = tail.slice(tail.indexOf('@media (prefers-reduced-motion: reduce)'))
  expect(reduce).toMatch(/\.seg\b[^{]*\{[^}]*animation:\s*none/)
  expect(reduce).toMatch(/\.seg-glow[^{]*\{[^}]*animation:\s*none/)
  expect(reduce).toMatch(/transition:\s*none/)
})

test('segment colour arrives in --t-fast (spec §7.4)', () => {
  const css = read('motion.css')
  const body = rule(css.slice(css.indexOf('/* ---------- Segmenti')), '.seg')
  expect(body).toMatch(/background-color\s+var\(--t-fast\)/)
})

// Contrasto WCAG fra due esadecimali.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const theme = (sel: string) => {
  const tokens = read('tokens.css')
  const body = tokens.slice(tokens.indexOf(sel)).match(/\{([^}]*)\}/)![1]
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))
}

test('«da fare» and «Di nuovo» stand out from the background (≥3:1) in both themes, by shape too', () => {
  const base = read('base.css')
  const todo = rule(base, '.seg-todo')
  const empty = rule(base, '.seg-empty')
  // da fare: riempimento basso (una linea sottile); Di nuovo: solo il bordo, senza riempimento
  expect(todo).toMatch(/100% 2px/)
  expect(empty).toMatch(/background:\s*transparent/)
  expect(empty).toMatch(/inset 0 0 0 1px/)
  for (const t of [theme('[data-theme="dark"]'), theme('[data-theme="light"]')]) {
    for (const body of [todo, empty]) {
      const vars = [...body.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1])
      expect(vars.length).toBeGreaterThan(0)
      for (const v of vars) expect(contrast(t[v], t.bg), `--${v}`).toBeGreaterThanOrEqual(3)
    }
  }
})
