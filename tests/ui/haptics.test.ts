import { expect, test, vi } from 'vitest'
import { buzz } from '../../src/ui/haptics'

test('absent setting vibrates 10 ms', () => {
  const vibrate = vi.fn(() => true)
  buzz({}, { vibrate })
  expect(vibrate).toHaveBeenCalledExactlyOnceWith(10)
})
test('haptics false does not vibrate; true does', () => {
  const vibrate = vi.fn(() => true)
  buzz({ haptics: false }, { vibrate })
  expect(vibrate).not.toHaveBeenCalled()
  buzz({ haptics: true }, { vibrate })
  expect(vibrate).toHaveBeenCalledTimes(1)
})
test('no vibrate function: no error', () => {
  expect(() => buzz({}, {})).not.toThrow()
})
test('vibrate that throws: no error', () => {
  expect(() => buzz({}, { vibrate: () => { throw new Error('nope') } })).not.toThrow()
})
