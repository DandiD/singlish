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
