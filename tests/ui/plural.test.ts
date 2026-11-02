import { expect, test } from 'vitest'
import { plural } from '../../src/ui/plural'

test('singolare solo per 1, plurale per 0 e per più di 1', () => {
  expect(plural(1, 'nuova', 'nuove')).toBe('1 nuova')
  expect(plural(0, 'nuova', 'nuove')).toBe('0 nuove')
  expect(plural(3, 'minuto fatto', 'minuti fatti')).toBe('3 minuti fatti')
})
