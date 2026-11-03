import { afterEach, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { useInstall } from '../../src/pwa/install'

afterEach(() => { cleanup(); window.__singlishInstall = null })

function Probe() {
  const { state, install } = useInstall()
  return <button type="button" onClick={() => void install()}>{state}</button>
}

test('installazione accettata: la scheda dice installata, non «installa dal menu»', async () => {
  window.__singlishInstall = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' as const }) }
  render(<Probe />)
  expect(screen.getByRole('button').textContent).toBe('available')
  await act(async () => { fireEvent.click(screen.getByRole('button')) })
  await waitFor(() => expect(screen.getByRole('button').textContent).toBe('installed'))
})

test('installazione rifiutata: non risulta installata', async () => {
  window.__singlishInstall = { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) }
  render(<Probe />)
  await act(async () => { fireEvent.click(screen.getByRole('button')) })
  expect(screen.getByRole('button').textContent).not.toBe('installed')
})

test('installata dal menu del browser (evento appinstalled): risulta installata', async () => {
  render(<Probe />)
  await act(async () => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.getByRole('button').textContent).toBe('installed')
})
