import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { App } from '../../src/app'

afterEach(cleanup)

test('unknown address: says the page does not exist and links back to Oggi', async () => {
  window.location.hash = '#/qualcosa/che/non/esiste'
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Pagina non trovata' })).toBeTruthy()
  expect(screen.queryByText('In arrivo.')).toBeNull()
  expect(screen.getByText('Questa pagina non esiste.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Torna a Oggi' }).getAttribute('href')).toBe('#/')
})
