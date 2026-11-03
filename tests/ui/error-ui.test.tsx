import { afterEach, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { ErrorToast } from '../../src/ui/components/ErrorToast'
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary'
import { createErrorStore } from '../../src/ui/report'

afterEach(cleanup)

test('un\'azione fallita mostra un avviso che si può chiudere', async () => {
  const store = createErrorStore()
  render(<ErrorToast store={store} />)
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => store.report(new TypeError('boom')))
  const alert = screen.getByRole('alert')
  expect(alert.textContent).toContain('Non salvato. Riprova')
  expect(alert.textContent).not.toContain('boom')
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi avviso' }))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('lo spazio pieno ha il suo messaggio', () => {
  const store = createErrorStore()
  render(<ErrorToast store={store} />)
  act(() => store.report(Object.assign(new Error('q'), { name: 'QuotaExceededError' })))
  expect(screen.getByRole('alert').textContent).toContain('Spazio esaurito')
})

test('le promesse rifiutate senza gestione arrivano all\'avviso', () => {
  const store = createErrorStore()
  const stop = store.listen(window)
  render(<ErrorToast store={store} />)
  const ev = new Event('unhandledrejection', { cancelable: true }) as Event & { reason?: unknown }
  ev.reason = new TypeError('boom')
  act(() => { window.dispatchEvent(ev) })
  expect(screen.getByRole('alert').textContent).toContain('Non salvato')
  stop()
})

function Boom(): never { throw new TypeError('render exploded') }

test('una pagina che si rompe mostra una schermata di riserva, non il bianco', () => {
  render(<ErrorBoundary><Boom /></ErrorBoundary>)
  expect(screen.getByRole('heading', { name: 'Questa pagina si è bloccata' })).toBeTruthy()
  expect(screen.getByText(/I tuoi dati sono al sicuro\./)).toBeTruthy()
  expect(screen.queryByText(/render exploded/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Ricarica' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Torna a Oggi' }).getAttribute('href')).toBe('#/')
})

test('se il database non si apre lo dice e spiega perché', () => {
  function NoDb(): never { throw Object.assign(new Error('x'), { name: 'OpenFailedError' }) }
  render(<ErrorBoundary><NoDb /></ErrorBoundary>)
  expect(screen.getByRole('heading', { name: 'Non riesco ad aprire i dati dell\'app' })).toBeTruthy()
  expect(screen.getByText(/navigazione privata/)).toBeTruthy()
})

test('un caricamento che fallisce dentro un effetto arriva alla schermata di riserva', async () => {
  const { useFailure } = await import('../../src/ui/useFailure')
  const { useEffect } = await import('preact/hooks')
  function Loader() {
    const fail = useFailure()
    useEffect(() => { Promise.reject(new TypeError('load')).catch(fail) }, [])
    return <main aria-busy="true" />
  }
  render(<ErrorBoundary><Loader /></ErrorBoundary>)
  expect(await screen.findByRole('heading', { name: 'Questa pagina si è bloccata' })).toBeTruthy()
})

test('una query dal vivo che fallisce arriva alla schermata di riserva', async () => {
  const { useLive } = await import('../../src/ui/useLive')
  function Live() {
    const v = useLive(() => Promise.reject(Object.assign(new Error('no idb'), { name: 'MissingAPIError' })), [])
    return <main aria-busy={v === undefined ? 'true' : undefined}>{String(v)}</main>
  }
  render(<ErrorBoundary><Live /></ErrorBoundary>)
  expect(await screen.findByRole('heading', { name: 'Non riesco ad aprire i dati dell\'app' })).toBeTruthy()
})

test('se il database non si apre, le pagine lo dicono invece di restare in attesa', async () => {
  const { DbGate } = await import('../../src/ui/components/DbGate')
  const { AppDepsProvider, defaultDeps } = await import('../../src/ui/deps')
  const db = { open: () => Promise.reject(Object.assign(new Error('no idb'), { name: 'MissingAPIError' })) }
  render(
    <AppDepsProvider value={{ ...defaultDeps, db: db as never }}>
      <ErrorBoundary><DbGate><main aria-busy="true" /></DbGate></ErrorBoundary>
    </AppDepsProvider>,
  )
  expect(await screen.findByRole('heading', { name: 'Non riesco ad aprire i dati dell\'app' })).toBeTruthy()
})
