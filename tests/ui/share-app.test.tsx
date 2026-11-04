import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { ShareApp } from '../../src/ui/components/ShareApp'

afterEach(cleanup)
const url = 'https://example.test/singlish/'

test('con la condivisione del sistema: apre il menu con nome e link dell\'app', async () => {
  const share = vi.fn(async () => {})
  render(<ShareApp url={url} nav={{ share }} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Condividi app' })) })
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Singlish', url }))
  expect(screen.getByRole('status').textContent).toBe('')
})

test('menu chiuso senza scegliere: nessun messaggio di errore', async () => {
  const share = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) })
  render(<ShareApp url={url} nav={{ share }} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Condividi app' })) })
  expect(screen.getByRole('status').textContent).toBe('')
})

test('senza condivisione del sistema: copia il link e lo dice', async () => {
  const writeText = vi.fn(async () => {})
  render(<ShareApp url={url} nav={{ clipboard: { writeText } }} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Condividi app' })) })
  expect(writeText).toHaveBeenCalledWith(url)
  expect(screen.getByRole('status').textContent).toBe('Link copiato')
})

test('né condivisione né appunti: mostra il link da copiare a mano', async () => {
  render(<ShareApp url={url} nav={{}} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Condividi app' })) })
  expect(screen.getByRole('status').textContent).toBe(`Copia questo link: ${url}`)
})
