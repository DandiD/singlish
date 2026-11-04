import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { AddSong } from '../../src/ui/screens/AddSong'
import { DELETE_NOTE } from '../../src/ui/screens/Songs'
import { readFileSync } from 'node:fs'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()) })
afterEach(() => { cleanup(); db.close() })

test('Aggiungi testo dice come si chiude davvero un testo: dallo Studio, non da solo', async () => {
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><AddSong kind="text" /></AppDepsProvider>)
  expect(await screen.findByText(/lo segni come completato dallo Studio/)).toBeTruthy()
  expect(screen.queryByText(/il testo si chiude quando/)).toBeNull()
})

test('Elimina canzone dice che anche le parole già ripassate restano nel profilo come note', () => {
  expect(DELETE_NOTE).toContain('o che hai già ripassato')
})

test('lo sblocco non promette un ordine della coda che non c\'è', () => {
  const src = readFileSync('src/ui/components/UnlockSheet.tsx', 'utf8')
  expect(src).not.toContain('dietro a quelle che aspettano')
  expect(src).toContain('insieme a quelle che aspettano già')
})
