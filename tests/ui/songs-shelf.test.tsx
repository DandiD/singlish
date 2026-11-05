import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { State } from 'ts-fsrs'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { DELETE_NOTE, Songs } from '../../src/ui/screens/Songs'
import { newFsrsCard } from '../../src/domain/scheduler'
import type { CardRow, Chunk, Song } from '../../src/db/types'

const now = new Date('2026-11-05T10:00:00')
const day = 86400000
const URL_OK = 'https://open.spotify.com/track/abc123'

const song = (over: Partial<Song>): Song => ({
  id: 's1', kind: 'song', title: 'Paper Lanterns', artist: 'The Night Ferries', spotifyUrl: null, lines: ['one', 'two'], status: 'studying', level: 'B1',
  difficultyKnownPct: 70, comprehensionBefore: 40, grammarPoint: null, connectedSpeech: [], addedAt: new Date(now.getTime() - 10 * day),
  analyzedAt: null, studyStartedAt: new Date(now.getTime() - 8 * day), ...over,
})
const chunk = (id: string, songId: string, lineIndex: number): Chunk => ({ id, songId, key: id, baseForm: id, surfaceForm: id, lineIndex, contexts: [{ songId, lineIndex }],
  type: 'idiom', cefr: 'B1', register: 'usable', topic: '', meaningIt: '', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '', userEdited: false, suspended: false })
const rCard = (itemId: string, state: State): CardRow => ({ id: 'k' + itemId, itemType: 'chunk', itemId, kind: 'R', unlocked: 1, due: now,
  fsrs: { ...newFsrsCard(now), state, due: now, reps: state === State.New ? 0 : 2 }, goodRCount: 0 })

let db: SinglishDB
beforeEach(() => { db = createDb('t-' + crypto.randomUUID()); window.location.hash = '#/songs' })
afterEach(() => { cleanup(); db.close(); vi.restoreAllMocks() })
const mount = () => render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Songs /></AppDepsProvider>)

const item = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('li')!
const fromMenu = (card: HTMLElement, text: string) => {
  fireEvent.click(within(card).getByRole('button', { name: /^Azioni per/ }))
  fireEvent.click(within(card).getByRole('menuitem', { name: text }))
}

async function seedShelf() {
  await db.songs.bulkAdd([
    song({ id: 's1', title: 'Paper Lanterns', addedAt: new Date(now.getTime() - 10 * day) }),
    song({ id: 's2', title: 'Rough Draft', status: 'draft', lines: ['x'], comprehensionBefore: null, studyStartedAt: undefined, addedAt: new Date(now.getTime() - 3 * day) }),
    song({ id: 's3', title: 'Old Tide', status: 'done', comprehensionBefore: 40, comprehensionAfter: 68, spotifyUrl: URL_OK, addedAt: new Date(now.getTime() - 1 * day) }),
  ])
  await db.chunks.bulkAdd([chunk('a', 's1', 0), chunk('b', 's1', 1)])
  await db.cards.bulkAdd([rCard('a', State.Review), rCard('b', State.New)])
}

describe('Canzoni come scaffale', () => {
  test('le aperte prima, poi il titolo «Completate» e le completate', async () => {
    await seedShelf()
    const { container } = mount()
    await screen.findByRole('heading', { name: 'Old Tide' })
    const done = screen.getByRole('heading', { name: 'Completate', level: 2 })
    const headings = [...container.querySelectorAll('h2, h3')].map((h) => `${h.tagName} ${h.textContent}`)
    // Le aperte nello stesso ordine di oggi (le più recenti prima), sotto il titolo della schermata (h2);
    // le completate sotto «Completate» scendono di un livello (h3).
    expect(headings).toEqual(['H2 Rough Draft', 'H2 Paper Lanterns', 'H2 Completate', 'H3 Old Tide'])
    expect(screen.getByRole('heading', { name: 'Old Tide', level: 3 })).toBeTruthy()
    expect(container.querySelectorAll('.shelf')).toHaveLength(2)
    expect(done.nextElementSibling!.contains(screen.getByRole('heading', { name: 'Old Tide' }))).toBe(true)
  })

  test('nessuna completata: niente titolo «Completate»', async () => {
    await db.songs.add(song({}))
    mount()
    await screen.findByRole('heading', { name: 'Paper Lanterns' })
    expect(screen.queryByRole('heading', { name: 'Completate' })).toBeNull()
  })

  test('la completata ha il guadagno come etichetta; senza i due valori niente', async () => {
    await seedShelf()
    await db.songs.add(song({ id: 's4', title: 'No Before', status: 'done', comprehensionBefore: null, comprehensionAfter: 70 }))
    mount()
    const old = await item('Old Tide')
    expect(old.querySelector('.shelf-gain')!.textContent).toBe('+28')
    expect((await item('No Before')).querySelector('.shelf-gain')).toBeNull()
    expect((await item('Paper Lanterns')).querySelector('.shelf-gain')).toBeNull()
  })

  test('copertina con l\'anello dei versi sbloccati se ci sono versi; senza versi niente anello', async () => {
    await seedShelf()
    mount()
    const open = await item('Paper Lanterns')
    const ring = open.querySelector<HTMLElement>('.song-carousel-ring')!
    expect(ring).toBeTruthy()
    expect(ring.style.getPropertyValue('--p')).toBe('0.5turn')
    expect(ring.querySelector('.cover')).toBeTruthy()
    expect((await item('Rough Draft')).querySelector('.song-carousel-ring')).toBeNull()
  })

  test('copertina e titolo sono un link: lo Studio, o l\'analisi per le bozze', async () => {
    await seedShelf()
    mount()
    const open = await item('Paper Lanterns')
    const link = within(open).getByRole('link', { name: 'Paper Lanterns' })
    expect(link.getAttribute('href')).toBe('#/songs/s1')
    expect(link.querySelector('.cover')).toBeTruthy()
    expect(link.querySelector('h2')).toBeTruthy()
    const draft = await item('Rough Draft')
    expect(within(draft).getByRole('link', { name: 'Rough Draft' }).getAttribute('href')).toBe('#/songs/s2/analyzing')
    expect(within(draft).getByRole('link', { name: 'Analizza ora' }).getAttribute('href')).toBe('#/songs/s2/analyzing')
    expect(within(await item('Old Tide')).getByRole('link', { name: 'Old Tide' }).getAttribute('href')).toBe('#/songs/s3')
  })

  test('le note di oggi restano: stato, «N% prima», «X di Y versi sbloccati»', async () => {
    await seedShelf()
    mount()
    const open = await item('Paper Lanterns')
    expect(open.querySelector('.badge')!.textContent).toBe('In studio')
    expect(within(open).getByText('40% prima')).toBeTruthy()
    expect(within(open).getByText('1 di 2 versi sbloccati')).toBeTruthy()
    expect(open.textContent).toContain('The Night Ferries · aggiunta il 26 ottobre')
  })

  test('«⋯» → Modifica apre il modulo a tutta riga', async () => {
    await seedShelf()
    mount()
    const card = await item('Paper Lanterns')
    // Le azioni secondarie non stanno più in vista sulla card.
    expect(within(card).queryByRole('button', { name: 'Modifica' })).toBeNull()
    fromMenu(card, 'Modifica')
    expect(within(card).getByLabelText('Titolo')).toBeTruthy()
    expect(card.classList.contains('shelf-wide')).toBe(true)
    fireEvent.click(within(card).getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(card.classList.contains('shelf-wide')).toBe(false))
  })

  test('«⋯» → Elimina chiede conferma con la nota, a tutta riga', async () => {
    await seedShelf()
    mount()
    const card = await item('Paper Lanterns')
    fromMenu(card, 'Elimina')
    const confirm = within(card).getByRole('alertdialog', { name: 'Conferma eliminazione' })
    expect(confirm.textContent).toContain(`Eliminare «Paper Lanterns»? ${DELETE_NOTE}`)
    expect(card.classList.contains('shelf-wide')).toBe(true)
    expect(await db.songs.get('s1')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Sì, elimina' }))
    await waitFor(async () => expect(await db.songs.get('s1')).toBeUndefined())
  })

  test('«Apri in Spotify ↗» nel menu solo con il link, e apre Spotify in una scheda nuova', async () => {
    await seedShelf()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    mount()
    const noLink = await item('Paper Lanterns')
    fireEvent.click(within(noLink).getByRole('button', { name: /^Azioni per/ }))
    expect(within(noLink).queryByRole('menuitem', { name: 'Apri in Spotify ↗' })).toBeNull()
    expect(within(noLink).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Modifica', 'Elimina'])
    fireEvent.keyDown(within(noLink).getByRole('menu'), { key: 'Escape' })
    const withLink = await item('Old Tide')
    fromMenu(withLink, 'Apri in Spotify ↗')
    expect(open).toHaveBeenCalledWith(URL_OK, '_blank', 'noopener,noreferrer')
  })

  test('il menu ha un nome che dice di quale canzone è', async () => {
    await seedShelf()
    mount()
    const card = await item('Paper Lanterns')
    const btn = within(card).getByRole('button', { name: 'Azioni per «Paper Lanterns»' })
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
  })

  test('testo libero: la copertina generata dice la fonte (Podcast)', async () => {
    await db.songs.add(song({ id: 't1', kind: 'text', source: 'podcast', title: 'Episode Nine', artist: '', status: 'analyzed' }))
    mount()
    const card = await item('Episode Nine')
    const cover = card.querySelector('.cover')!
    expect(cover.querySelector('.cover-source')!.textContent).toBe('Podcast')
    expect(cover.getAttribute('aria-hidden')).toBe('true')
    // La card la nomina già a parole.
    expect(card.textContent).toContain('Podcast · aggiunto il')
  })

  test('tastiera: il fuoco entra nel modulo o nella conferma, e con Annulla torna al «⋯»', async () => {
    await seedShelf()
    mount()
    const card = await item('Paper Lanterns')
    const more = () => within(card).getByRole('button', { name: 'Azioni per «Paper Lanterns»' })
    fromMenu(card, 'Modifica')
    await waitFor(() => expect(document.activeElement).toBe(within(card).getByLabelText('Link Spotify')))
    fireEvent.click(within(card).getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(document.activeElement).toBe(more()))
    fromMenu(card, 'Elimina')
    await waitFor(() => expect(document.activeElement).toBe(within(card).getByRole('button', { name: 'Annulla' })))
    fireEvent.click(within(card).getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(document.activeElement).toBe(more()))
    expect(await db.songs.get('s1')).toBeTruthy()
  })
})
