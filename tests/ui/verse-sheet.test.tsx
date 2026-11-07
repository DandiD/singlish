import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-11-04T10:00:00Z')
const song: Song = {
  id: 's1', kind: 'song', title: 'Lantern Road', artist: '', spotifyUrl: null,
  lines: ['paper lanterns drift', 'quiet rivers hold the moon', 'we walk on'],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
  lineTranslations: [{ lineIndex: 1, textIt: 'Fiumi quieti reggono la luna' }],
  lineNotes: [{ lineIndex: 1, senseIt: 'Immagine di quiete.', grammarIt: null, cultureIt: 'Luna e fiumi.' }],
}
beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  await db.songs.add(song)
})
afterEach(() => { cleanup(); db.close() })
const view = (itemId?: string) =>
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('{}')) as typeof fetch, sleep: async () => {}, now: () => now }}><Study songId="s1" itemId={itemId} /></AppDepsProvider>)

test('il link «Note sul verso» c\'è solo sul verso con nota', async () => {
  view()
  const link = await screen.findByRole('link', { name: 'Note sul verso 2' })
  expect(link.getAttribute('href')).toContain('ln%3A1')
  expect(screen.queryByRole('link', { name: 'Note sul verso 1' })).toBeNull()
})

test('il foglio mostra verso, traduzione, Senso e Cultura; Grammatica solo se presente', async () => {
  view('ln:1')
  const dlg = await screen.findByRole('dialog')
  const q = within(dlg)
  expect(q.getByText('quiet rivers hold the moon').getAttribute('lang') ?? q.getByText('quiet rivers hold the moon').closest('[lang]')?.getAttribute('lang')).toBe('en')
  expect(q.getByText('Fiumi quieti reggono la luna')).toBeTruthy()
  expect(q.getByText('Senso')).toBeTruthy()
  expect(q.getByText('Immagine di quiete.')).toBeTruthy()
  expect(q.getByText('Cultura')).toBeTruthy()
  expect(q.getByText('Luna e fiumi.')).toBeTruthy()
  expect(q.queryByText('Grammatica')).toBeNull()
})
