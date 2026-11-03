import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { createSwStore, type RegisterFn } from '../../src/pwa/sw-store'
import { UpdateToast } from '../../src/ui/components/UpdateToast'
import { OfflineBadge } from '../../src/ui/components/OfflineBadge'
import { InstallCard } from '../../src/ui/components/InstallCard'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup() {
  const hooks: { onNeedRefresh?: () => void; onOfflineReady?: () => void } = {}
  const update = vi.fn(async () => {})
  const register: RegisterFn = (o) => (Object.assign(hooks, o), update)
  const store = createSwStore(register, null)
  return { hooks, update, store }
}

describe('UpdateToast', () => {
  test('nuova versione: Aggiorna si spegne e dice Aggiorno…', async () => {
    const { hooks, update, store } = setup()
    render(<UpdateToast store={store} />)
    act(() => hooks.onNeedRefresh!())
    expect(screen.getByText('Nuova versione')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' })) })
    expect(update).toHaveBeenCalledWith(true)
    const btn = screen.getByRole('button', { name: 'Aggiorno…' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  test('senza ricaricamento entro 8 secondi dice che non è riuscito', async () => {
    vi.useFakeTimers()
    const { hooks, store } = setup()
    render(<UpdateToast store={store} />)
    act(() => hooks.onNeedRefresh!())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' })) })
    act(() => { vi.advanceTimersByTime(8000) })
    expect(screen.getByText('Aggiornamento non riuscito')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy()
  })

  test('pronta offline sparisce da sola', () => {
    vi.useFakeTimers()
    const { hooks, store } = setup()
    render(<UpdateToast store={store} />)
    act(() => hooks.onOfflineReady!())
    expect(screen.getByText('Pronta anche offline')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Pronta anche offline')).toBeNull()
  })

  test('Più tardi chiude l\'avviso', () => {
    const { hooks, store } = setup()
    render(<UpdateToast store={store} />)
    act(() => hooks.onNeedRefresh!())
    fireEvent.click(screen.getByRole('button', { name: 'Più tardi' }))
    expect(screen.queryByText('Nuova versione')).toBeNull()
  })
})

describe('OfflineBadge', () => {
  test('compare quando la rete cade e sparisce quando torna', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBadge />)
    expect(screen.queryByText('Offline')).toBeNull()
    spy.mockReturnValue(false)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByText('Offline')).toBeTruthy()
    spy.mockReturnValue(true)
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(screen.queryByText('Offline')).toBeNull()
    spy.mockRestore()
  })
})

describe('InstallCard', () => {
  test('installabile: il pulsante chiama onInstall', () => {
    const onInstall = vi.fn()
    render(<InstallCard state="available" onInstall={onInstall} />)
    fireEvent.click(screen.getByRole('button', { name: 'Installa Singlish' }))
    expect(onInstall).toHaveBeenCalled()
  })
  test('iOS: spiega Condividi → Aggiungi alla schermata Home', () => {
    render(<InstallCard state="ios" onInstall={() => {}} />)
    expect(screen.getByText(/Aggiungi alla schermata Home/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
  test('già installata', () => {
    render(<InstallCard state="installed" onInstall={() => {}} />)
    expect(screen.getByText('App installata su questo dispositivo.')).toBeTruthy()
  })
})
