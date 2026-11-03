import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
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

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

test('ogni pagina dà il suo titolo alla scheda del browser', async () => {
  window.location.hash = '#/settings'
  render(<App />)
  await screen.findByRole('heading', { name: 'Impostazioni' })
  expect(document.title).toBe('Impostazioni · Singlish')
  window.location.hash = '#/'
  await waitFor(() => expect(document.title).toBe('Singlish'))
})

test('«Indietro» torna alla pagina precedente senza aggiungere voci alla cronologia', async () => {
  window.location.hash = '#/'
  render(<App />)
  await tick()
  window.location.hash = '#/settings'
  await screen.findByRole('heading', { name: 'Impostazioni' })
  const len = history.length
  fireEvent.click(screen.getByRole('link', { name: 'Indietro' }))
  await waitFor(() => expect(window.location.hash).toBe('#/'))
  expect(history.length).toBe(len)
})

test('dopo una navigazione il fuoco va sul titolo della nuova pagina', async () => {
  window.location.hash = '#/'
  render(<App />)
  await tick()
  window.location.hash = '#/settings'
  const h1 = await screen.findByRole('heading', { name: 'Impostazioni' })
  await waitFor(() => expect(document.activeElement).toBe(h1))
})

test('toccare la scheda già attiva riporta la pagina in cima', async () => {
  window.location.hash = '#/songs'
  render(<App />)
  await screen.findByRole('heading', { name: 'Canzoni' })
  const calls: unknown[] = []
  const orig = window.scrollTo
  window.scrollTo = ((...a: unknown[]) => { calls.push(a) }) as typeof window.scrollTo
  try {
    const link = screen.getAllByRole('link', { name: /Canzoni/ }).find((a) => a.closest('.bottom-nav'))!
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(calls.length).toBe(1)
  } finally {
    window.scrollTo = orig
  }
})

test('il fuoco aspetta il titolo di una pagina che carica i dati', async () => {
  const { db } = await import('../../src/db/db')
  await db.songs.put({
    id: 'nav1', kind: 'song', title: 'Invented Tune', artist: '', spotifyUrl: null, lines: ['la la'],
    status: 'studying', level: 'B1', difficultyKnownPct: null, comprehensionBefore: null, grammarPoint: null,
    connectedSpeech: [], addedAt: new Date(0), analyzedAt: new Date(0),
  })
  window.location.hash = '#/'
  render(<App />)
  await tick()
  window.location.hash = '#/songs/nav1'
  const h1 = await screen.findByRole('heading', { level: 1, name: 'Invented Tune' })
  await waitFor(() => expect(document.activeElement).toBe(h1))
})
