import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { activeSongCount } from '../../src/domain/ingest'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide'], status: 'studying', level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/songs/s1'
  await db.songs.add(song)
})
afterEach(() => {
  cleanup()
  db.close()
})

const mount = () =>
  render(
    <AppDepsProvider
      value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}
    >
      <Study songId="s1" />
    </AppDepsProvider>,
  )

test('Segna come completata asks for confirmation, then marks done and goes to Canzoni', async () => {
  mount()
  expect(await activeSongCount(db)).toBe(1)
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completata' }))
  // in-page confirm: nothing changes yet
  expect((await db.songs.get('s1'))!.status).toBe('studying')
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect((await db.songs.get('s1'))!.status).toBe('done'))
  expect(await activeSongCount(db)).toBe(0)
  expect(window.location.hash).toBe('#/songs')
})

test('cancelling the confirm leaves the song untouched', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completata' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
  expect((await db.songs.get('s1'))!.status).toBe('studying')
  expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
})

test('opening an item sheet moves focus into the dialog once its data has loaded', async () => {
  await db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: false, userEdited: false,
  })
  render(
    <AppDepsProvider
      value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}
    >
      <Study songId="s1" itemId="c1" />
    </AppDepsProvider>,
  )
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(document.activeElement).toBe(dialog))
})

test('closing the item sheet gives focus back to the element that opened it', async () => {
  await db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: false, userEdited: false,
  })
  const deps = { db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }
  const view = render(<AppDepsProvider value={deps}><Study songId="s1" /></AppDepsProvider>)
  const link = await screen.findByRole('link', { name: 'let it slide' })
  link.focus()
  view.rerender(<AppDepsProvider value={deps}><Study songId="s1" itemId="c1" /></AppDepsProvider>)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')))
  view.rerender(<AppDepsProvider value={deps}><Study songId="s1" /></AppDepsProvider>)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'let it slide' }))
})

test('closing the sheet focuses the item link even when the tap did not focus it (Safari)', async () => {
  await db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: false, userEdited: false,
  })
  const deps = { db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }
  const view = render(<AppDepsProvider value={deps}><Study songId="s1" /></AppDepsProvider>)
  await screen.findByRole('link', { name: 'let it slide' })
  ;(document.activeElement as HTMLElement | null)?.blur()
  view.rerender(<AppDepsProvider value={deps}><Study songId="s1" itemId="c1" /></AppDepsProvider>)
  await screen.findByRole('dialog')
  view.rerender(<AppDepsProvider value={deps}><Study songId="s1" /></AppDepsProvider>)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('link', { name: 'let it slide' }))
})

test('completamento non salvato: avviso e si resta sulla canzone', async () => {
  const { errors } = await import('../../src/ui/report')
  errors.dismiss()
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completata' }))
  db.songs.update = (() => Promise.reject(new Error('disk'))) as never
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await waitFor(() => expect(errors.get()).toMatch(/^Non salvato\./))
  expect(window.location.hash).toBe('#/songs/s1')
})
