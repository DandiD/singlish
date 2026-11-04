import { expect, test } from 'vitest'
import { chorusLines } from '../../src/domain/chorus'

test('il ritornello sono le righe ripetute, nell\'ordine in cui compaiono', () => {
  const lines = ['verse one here', 'Late train home, no one waiting', "I'm done with the waiting", 'verse two', 'late train home, no one waiting!', "I'm done with the waiting", 'end']
  expect(chorusLines(lines)).toEqual(['Late train home, no one waiting', "I'm done with the waiting"])
})
test('senza righe ripetute non c\'è ritornello', () => {
  expect(chorusLines(['a b', 'c d', 'e f'])).toEqual([])
})
test('al massimo sei righe', () => {
  const block = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map((r) => `${r} line`)
  expect(chorusLines([...block, 'x', ...block])).toHaveLength(6)
})
