import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Settings } from '../../src/ui/screens/Settings'
import { getSettings, saveSettings } from '../../src/domain/settings'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
})
afterEach(() => {
  cleanup()
  db.close()
  delete document.documentElement.dataset.theme
})

function mount(fakeFetch: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return render(
    <AppDepsProvider value={{ db, fetch: fakeFetch, sleep: async () => {}, now: () => now }}>
      <Settings />
    </AppDepsProvider>,
  )
}

const okBody = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })

describe('Settings', () => {
  test('changing level to B2 updates settings and band', async () => {
    mount()
    const select = (await screen.findByLabelText('Livello')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'B2' } })
    await waitFor(async () => {
      const s = await getSettings(db)
      expect(s.level).toBe('B2')
      expect([s.bandStart, s.bandEnd]).toEqual([3000, 8000])
    })
  })

  test('Prova with 200 saves key and shows Chiave valida', async () => {
    const f = vi.fn(async () => okBody()) as unknown as typeof fetch
    mount(f)
    const input = (await screen.findByLabelText('Chiave API')) as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.input(input, { target: { value: 'KEY123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText('Chiave valida')
    expect((await getSettings(db)).apiKey).toBe('KEY123')
  })

  test('Prova with 400 saves nothing and shows error', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 400 })) as unknown as typeof fetch
    mount(f)
    const input = await screen.findByLabelText('Chiave API')
    fireEvent.input(input, { target: { value: 'BAD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText('Chiave non valida, nulla salvato')
    expect((await getSettings(db)).apiKey).toBe('')
  })

  test('stored key + empty field: Prova tests the stored key with the typed model and saves the model only', async () => {
    await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
    const f = vi.fn(async () => okBody()) as unknown as typeof fetch
    const { container } = mount(f)
    const keyInput = (await screen.findByLabelText('Chiave API')) as HTMLInputElement
    expect(keyInput.value).toBe('')
    expect(container.innerHTML).not.toContain('STORED')
    fireEvent.input(screen.getByLabelText('Modello'), { target: { value: 'new-model' } })
    const btn = screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    await screen.findByText('Chiave valida')
    const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toContain('new-model')
    expect(JSON.stringify(call)).toContain('STORED')
    const s = await getSettings(db)
    expect(s.apiKey).toBe('STORED')
    expect(s.model).toBe('new-model')
    expect(container.innerHTML).not.toContain('STORED')
  })

  test('stored key + empty field: failing Prova saves nothing', async () => {
    await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
    const f = vi.fn(async () => new Response('{}', { status: 400 })) as unknown as typeof fetch
    mount(f)
    await screen.findByLabelText('Chiave API')
    fireEvent.input(screen.getByLabelText('Modello'), { target: { value: 'new-model' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText('Chiave non valida, nulla salvato')
    const s = await getSettings(db)
    expect(s.apiKey).toBe('STORED')
    expect(s.model).toBe('old-model')
  })

  test('no stored key and empty field: Prova stays disabled', async () => {
    mount()
    await screen.findByLabelText('Chiave API')
    expect((screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('theme change applies to documentElement', async () => {
    mount()
    fireEvent.click(await screen.findByRole('radio', { name: 'Scuro' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    await waitFor(async () => expect((await getSettings(db)).theme).toBe('dark'))
  })

  test('import cancel leaves data untouched', async () => {
    await saveSettings(db, { newPerDay: 20 })
    const { container } = mount()
    await screen.findByLabelText('Livello')
    const file = new File([JSON.stringify({ anything: 1 })], 'b.json', { type: 'application/json' })
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText('Sostituire tutti i dati?')
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(screen.queryByText('Sostituire tutti i dati?')).toBeNull())
    expect((await getSettings(db)).newPerDay).toBe(20)
  })
})
