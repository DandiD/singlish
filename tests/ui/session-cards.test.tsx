import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Session } from '../../src/ui/screens/Session'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide, I play it down', 'We wander beside the harbour wall'],
  lineTranslations: [{ lineIndex: 0, textIt: 'Ogni notte lascio correre' }],
  status: 'studying', level: 'B2', difficultyKnownPct: 70, comprehensionBefore: null,
  grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}
const chunk = (id: string, surface: string, line: number, extra: Partial<Chunk> = {}): Chunk => ({
  id, songId: 's1', key: surface, baseForm: surface, surfaceForm: surface, lineIndex: line,
  contexts: [{ songId: 's1', lineIndex: line }], type: 'idiom', cefr: 'B2', register: 'usable', topic: '',
  meaningIt: 'sig-' + id, explanationIt: 'spiega-' + id, extraExampleEn: '', productionPromptIt: '',
  pronunciationNoteIt: '', userEdited: false, suspended: false, ...extra,
})
const reviewCard = (id: string, itemId: string, kind: 'R' | 'C'): CardRow => {
  const due = new Date('2026-10-29T10:00:00Z')
  const fsrs = { ...newFsrsCard(now), state: State.Review, stability: 5, difficulty: 5, reps: 2, last_review: new Date('2026-10-20T10:00:00Z'), due }
  return { id, itemType: 'chunk', itemId, kind, unlocked: 1, due, fsrs, goodRCount: kind === 'C' ? 2 : 0 }
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/session'
  await db.songs.add(song)
})
afterEach(() => { cleanup(); db.close() })

const renderSession = () => render(
  <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Session /></AppDepsProvider>,
)
const typeAndCheck = async (text: string) => {
  fireEvent.input(await screen.findByRole('textbox'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Controlla' }))
}

test('R card shows the line translation only after Mostra significato', async () => {
  await db.chunks.add(chunk('c1', 'let it slide', 0))
  await db.cards.add(reviewCard('k1', 'c1', 'R'))
  const { container } = renderSession()
  await screen.findByRole('button', { name: 'Mostra significato' })
  expect(container.querySelector('.verse-it')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Mostra significato' }))
  expect(container.querySelector('.verse-it')!.textContent).toBe('Ogni notte lascio correre')
})

test('R card without a translation for the line shows none', async () => {
  await db.chunks.add(chunk('c1', 'wander beside', 1))
  await db.cards.add(reviewCard('k1', 'c1', 'R'))
  const { container } = renderSession()
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  expect(container.querySelector('.verse-it')).toBeNull()
})

test('R card of an Expand entry shows no translation', async () => {
  await db.chunks.add(chunk('c1', 'let it slide', 0, { origin: 'expand', extraExampleEn: 'She let it slide again.' }))
  await db.cards.add(reviewCard('k1', 'c1', 'R'))
  const { container } = renderSession()
  fireEvent.click(await screen.findByRole('button', { name: 'Mostra significato' }))
  expect(container.querySelector('.verse-it')).toBeNull()
})

test('C exact answer snaps the expected form into the gap', async () => {
  await db.chunks.add(chunk('c2', 'let it slide', 0))
  await db.cards.add(reviewCard('k2', 'c2', 'C'))
  const { container } = renderSession()
  await screen.findByRole('textbox')
  expect(container.querySelector('.gap')!.classList.contains('snap')).toBe(false)
  await typeAndCheck('let it slide')
  const gap = container.querySelector('.gap.snap')!
  expect(gap.textContent).toBe('let it slide')
  expect(gap.getAttribute('aria-label')).toBeTruthy()
})

test('C typo underlines the differing part of the expected form', async () => {
  await db.chunks.add(chunk('c3', 'wander', 1))
  await db.cards.add(reviewCard('k3', 'c3', 'C'))
  const { container } = renderSession()
  await typeAndCheck('wonder')
  const fb = container.querySelector('.feedback p')!
  expect(fb.querySelector('u')!.textContent).toBe('a')
  expect(fb.textContent).toBe('Risposta attesa: wander · voto proposto: Difficile')
  expect(container.querySelector('.gap.snap')).toBeNull()
})

test('C typo with a curly apostrophe and extra spaces underlines only the wrong letter', async () => {
  await db.songs.put({ ...song, lines: [...song.lines, "Don't let go of the paper boat"] })
  await db.chunks.add(chunk('c4', "don't let go", 2))
  await db.cards.add(reviewCard('k4', 'c4', 'C'))
  const { container } = renderSession()
  await typeAndCheck('  don’t  let ga')
  const fb = container.querySelector('.feedback p')!
  expect(fb.querySelector('u')!.textContent).toBe('o')
  expect(fb.textContent).toBe("Risposta attesa: don't let go · voto proposto: Difficile")
})

test('C wrong answer: no underline and an empty gap', async () => {
  await db.chunks.add(chunk('c2', 'let it slide', 0))
  await db.cards.add(reviewCard('k2', 'c2', 'C'))
  const { container } = renderSession()
  await typeAndCheck('completely different')
  expect(container.querySelector('.feedback u')).toBeNull()
  expect(container.querySelector('.gap.snap')).toBeNull()
  expect(container.querySelector('.gap')!.textContent!.trim()).toBe('')
})

test('motion.css switches off snap and verse-it animations under reduced motion', () => {
  const css = readFileSync('src/styles/motion.css', 'utf8')
  const reduce = css.slice(css.lastIndexOf('/* ---------- Riga tradotta'))
  expect(css).toMatch(/\.snap\s*\{[^}]*--ease-spring/)
  expect(reduce).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  expect(reduce).toMatch(/\.snap[^{]*\{[^}]*animation:\s*none/)
  expect(reduce).toMatch(/\.verse-it[^{]*\{[^}]*animation:\s*none/)
})
