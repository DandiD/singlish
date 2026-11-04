import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { VocabTest } from '../../src/ui/screens/VocabTest'
import { Progress } from '../../src/ui/screens/Progress'
import { getSettings } from '../../src/domain/settings'
import { resetRanksCache } from '../../src/domain/freq'
import { parseRoute } from '../../src/router'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00')
const freq = Array.from({ length: 20000 }, (_, i) => `word${i + 1}`)
const fakeFetch = (async () => new Response(JSON.stringify(freq), { status: 200 })) as unknown as typeof fetch
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()); resetRanksCache(); window.location.hash = '#/vocab-test' })
afterEach(() => { cleanup(); db.close() })
const mount = (ui: preact.JSX.Element) => render(<AppDepsProvider value={{ db, fetch: fakeFetch, sleep: async () => {}, now: () => now }}>{ui}</AppDepsProvider>)

test('80 parole, sì o no, poi la stima con il grafico per fascia; si può aggiornare la fascia utile', async () => {
  expect(parseRoute('#/vocab-test')).toEqual({ name: 'vocabTest' })
  mount(<VocabTest />)
  expect(await screen.findByText('Parola 1 di 80')).toBeTruthy()
  for (let i = 0; i < 80; i++) {
    await screen.findByText(`Parola ${i + 1} di 80`)
    const word = document.querySelector('.vt-word')!.textContent!
    const rank = word.startsWith('word') ? Number(word.slice(4)) : Infinity
    fireEvent.click(screen.getByRole('button', { name: rank <= 4000 ? 'La conosco' : 'Non la conosco' }))
  }
  expect(await screen.findByText('≈ 4.000')).toBeTruthy()
  expect(screen.getByRole('img', { name: /Percentuale di parole note per fascia/ })).toBeTruthy()
  expect(screen.getByText(/Parole inventate segnate come note: 0 su 20/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Aggiorna la fascia utile' }))
  await waitFor(async () => expect(await getSettings(db)).toMatchObject({ bandStart: 4000, bandEnd: 9000 }))
  expect((await getSettings(db)).vocabTests).toEqual([{ at: now, estimate: 4000, falseAlarms: 0 }])
})

test('Progressi: senza test lo propone; dopo, mostra la stima', async () => {
  mount(<Progress />)
  const link = await screen.findByRole('link', { name: /Vocabolario stimato/ })
  expect(link.getAttribute('href')).toBe('#/vocab-test')
  expect(link.textContent).toContain('Fai il test')
  cleanup()
  const { saveSettings } = await import('../../src/domain/settings')
  await saveSettings(db, { vocabTests: [{ at: new Date('2026-10-31T10:00:00'), estimate: 4300, falseAlarms: 2 }] })
  mount(<Progress />)
  expect((await screen.findByRole('link', { name: /Vocabolario stimato/ })).textContent).toContain('≈ 4.300 parole')
})

test('tocchi rapidi: nessuna risposta persa', async () => {
  mount(<VocabTest />)
  const yes = await screen.findByRole('button', { name: 'La conosco' })
  for (let i = 0; i < 80; i++) fireEvent.click(yes)
  await waitFor(async () => expect((await getSettings(db)).vocabTests).toHaveLength(1))
})
