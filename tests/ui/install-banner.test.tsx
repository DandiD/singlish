import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Today } from '../../src/ui/screens/Today'
import { getSettings, saveSettings } from '../../src/domain/settings'
import type { InstallPromptEvent } from '../../src/pwa/install'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { cleanup(); db.close(); window.__singlishInstall = null })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Today /></AppDepsProvider>)

function fakePrompt(outcome: 'accepted' | 'dismissed'): InstallPromptEvent {
  return { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) }
}

test('installabile: il banner in Oggi propone di installare e il pulsante apre la richiesta del browser', async () => {
  const p = fakePrompt('accepted')
  window.__singlishInstall = p
  mount()
  const banner = await screen.findByRole('region', { name: 'Installa Singlish' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Installa' })) })
  expect(p.prompt).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(banner.isConnected).toBe(false))
})

test('chiudere il banner lo nasconde e lo ricorda (in IndexedDB)', async () => {
  window.__singlishInstall = fakePrompt('dismissed')
  mount()
  await screen.findByRole('region', { name: 'Installa Singlish' })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Chiudi' })) })
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Installa Singlish' })).toBeNull())
  expect((await getSettings(db)).installBannerDismissed).toBe(true)
})

test('già chiuso una volta: non ricompare', async () => {
  await saveSettings(db, { installBannerDismissed: true })
  window.__singlishInstall = fakePrompt('dismissed')
  mount()
  await screen.findByRole('heading', { name: 'Ripasso di oggi' })
  expect(screen.queryByRole('region', { name: 'Installa Singlish' })).toBeNull()
})

test('senza richiesta del browser né iOS: niente banner (le istruzioni restano nelle Impostazioni)', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Ripasso di oggi' })
  expect(screen.queryByRole('region', { name: 'Installa Singlish' })).toBeNull()
})

test('su iOS il banner spiega come aggiungerla alla schermata Home', async () => {
  const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
  mount()
  const banner = await screen.findByRole('region', { name: 'Installa Singlish' })
  expect(banner.textContent).toContain('Aggiungi alla schermata Home')
  expect(screen.queryByRole('button', { name: 'Installa' })).toBeNull()
  ua.mockRestore()
})
