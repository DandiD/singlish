import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Study } from '../../src/ui/screens/Study'
import { activeSongCount } from '../../src/domain/ingest'
import { resetCoverAttempts } from '../../src/domain/cover'
import { songLook } from '../../src/ui/cover'
import { errors } from '../../src/ui/report'
import type { Song } from '../../src/db/types'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

const song: Song = {
  id: 's1', kind: 'song', title: 'Night Song', artist: 'A', spotifyUrl: null,
  lines: ['Every night I let it slide'], status: 'studying', level: 'B2', difficultyKnownPct: 70,
  comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now,
}

beforeEach(async () => {
  resetCoverAttempts()
  db = createDb('t-' + crypto.randomUUID())
  window.location.hash = '#/songs/s1'
  await db.songs.add(song)
})
afterEach(() => {
  cleanup()
  db.close()
})

/** «Segna come completata» ed «Elimina» stanno nel menu «⋯» della testata. */
const fromMenu = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Altre azioni' }))
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

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
  await fromMenu('Segna come completata')
  // in-page confirm: nothing changes yet
  expect((await db.songs.get('s1'))!.status).toBe('studying')
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await waitFor(async () => expect((await db.songs.get('s1'))!.status).toBe('done'))
  expect(await activeSongCount(db)).toBe(0)
  expect(window.location.hash).toBe('#/songs')
})

test('cancelling the confirm leaves the song untouched', async () => {
  mount()
  await fromMenu('Segna come completata')
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
  await fromMenu('Segna come completata')
  db.songs.update = (() => Promise.reject(new Error('disk'))) as never
  fireEvent.click(await screen.findByRole('button', { name: 'Conferma' }))
  await waitFor(() => expect(errors.get()).toMatch(/^Non salvato\./))
  expect(window.location.hash).toBe('#/songs/s1')
})

describe('modifiche nella scheda', () => {
  const addChunk = () => db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: 'vecchia', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: false, userEdited: false,
  })
  const openEdit = async () => {
    window.location.hash = '#/songs/s1?item=c1'
    render(
      <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
        <Study songId="s1" itemId="c1" />
      </AppDepsProvider>,
    )
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    fireEvent.input(screen.getByLabelText('Significato'), { target: { value: 'non darci peso' } })
  }
  for (const [how, act] of [
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['X', () => fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))],
    ['velo', () => fireEvent.click(document.querySelector('.sheet-scrim')!)],
  ] as const) {
    test(`chiudendo con ${how} mentre si modifica, la modifica si salva`, async () => {
      await addChunk()
      await openEdit()
      act()
      await waitFor(async () => expect((await db.chunks.get('c1'))!.meaningIt).toBe('non darci peso'))
      expect((await db.chunks.get('c1'))!.userEdited).toBe(true)
    })
  }
  test('Annulla non salva', async () => {
    await addChunk()
    await openEdit()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 30))
    expect((await db.chunks.get('c1'))!.meaningIt).toBe('lasciar correre')
  })
  test('un significato vuoto non si salva', async () => {
    await addChunk()
    await openEdit()
    fireEvent.input(screen.getByLabelText('Significato'), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Salva' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 30))
    expect((await db.chunks.get('c1'))!.meaningIt).toBe('lasciar correre')
  })
})

test('uscendo dallo Studio la sua sessione si chiude', async () => {
  const { unmount } = render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" />
    </AppDepsProvider>,
  )
  await waitFor(async () => expect(await db.sessions.count()).toBe(1))
  await new Promise((r) => setTimeout(r, 20))
  unmount()
  await waitFor(async () => expect((await db.sessions.toArray())[0].endedAt).toEqual(now))
})

test('parlato connesso: toccandolo si apre la scheda con forma scritta, cantata e spiegazione', async () => {
  await db.songs.update('s1', { connectedSpeech: [{ lineIndex: 0, written: 'let it', sung: 'leddit', noteIt: 'La t tra vocali diventa una d leggera.' }] })
  const { unmount } = render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" />
    </AppDepsProvider>,
  )
  const link = await screen.findByRole('link', { name: 'let it' })
  expect(link.getAttribute('href')).toBe('#/songs/s1?item=cs%3A0')
  unmount()
  window.location.hash = '#/songs/s1?item=cs%3A0'
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" itemId="cs:0" />
    </AppDepsProvider>,
  )
  const dialog = await screen.findByRole('dialog', { name: 'Pronuncia' })
  expect(dialog.textContent).toContain('let it')
  expect(dialog.textContent).toContain('leddit')
  expect(dialog.textContent).toContain('La t tra vocali diventa una d leggera.')
  expect(dialog.textContent).toContain('RIGA 1')
})

test('la scheda «Pronuncia» mostra la traduzione del verso, se c\'è', async () => {
  await db.songs.update('s1', {
    connectedSpeech: [{ lineIndex: 0, written: 'let it', sung: 'leddit', noteIt: 'La t tra vocali diventa una d leggera.' }],
    lineTranslations: [{ lineIndex: 0, textIt: 'Lascia correre, va bene così' }],
  })
  window.location.hash = '#/songs/s1?item=cs%3A0'
  const { unmount } = render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" itemId="cs:0" />
    </AppDepsProvider>,
  )
  const dialog = await screen.findByRole('dialog', { name: 'Pronuncia' })
  expect(dialog.textContent).toContain('TRADUZIONE DEL VERSO')
  expect(dialog.textContent).toContain('Lascia correre, va bene così')
  unmount()
  await db.songs.update('s1', { lineTranslations: [{ lineIndex: 3, textIt: 'Un altro verso' }] })
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" itemId="cs:0" />
    </AppDepsProvider>,
  )
  const again = await screen.findByRole('dialog', { name: 'Pronuncia' })
  expect(again.textContent).not.toContain('TRADUZIONE DEL VERSO')
})

test('legenda: ogni tipo di evidenziazione ha la sua voce, espressione fissa compresa', async () => {
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" />
    </AppDepsProvider>,
  )
  const legend = await screen.findByRole('list', { name: 'Legenda' })
  expect(legend.textContent).toContain('espressione fissa')
})

test('nella scheda il chunk è evidenziato con il colore del suo tipo', async () => {
  await db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: false, userEdited: false,
  })
  window.location.hash = '#/songs/s1?item=c1'
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" itemId="c1" />
    </AppDepsProvider>,
  )
  const dialog = await screen.findByRole('dialog')
  expect(dialog.querySelector('.examples .hl')!.className).toContain('id')
})

test('dallo Studio: Elimina canzone chiede conferma, poi elimina e porta a Canzoni', async () => {
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" />
    </AppDepsProvider>,
  )
  await fromMenu('Elimina canzone')
  fireEvent.click(screen.getByRole('button', { name: 'Sì, elimina' }))
  await waitFor(async () => expect(await db.songs.get('s1')).toBeUndefined(), { timeout: 3000 })
  await waitFor(() => expect(window.location.hash).toBe('#/songs'), { timeout: 3000 })
})

test('una voce sospesa si riattiva dalla sua scheda', async () => {
  await db.chunks.add({
    id: 'c1', songId: 's1', key: 'let it slide', baseForm: 'let it slide', surfaceForm: 'let it slide', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }], type: 'idiom', cefr: 'B2', register: 'informal', topic: 'other',
    meaningIt: 'lasciar correre', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    suspended: true, userEdited: false,
  })
  window.location.hash = '#/songs/s1?item=c1'
  render(
    <AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}>
      <Study songId="s1" itemId="c1" />
    </AppDepsProvider>,
  )
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: 'Riattiva' }))
  await waitFor(async () => expect((await db.chunks.get('c1'))!.suspended).toBe(false))
  expect(await screen.findByRole('button', { name: 'Sospendi' })).toBeTruthy()
})

test('escludere una parola: la conferma dice quante voci di Espandi escono con lei', async () => {
  await db.words.bulkAdd([
    { id: 'w1', lemma: 'rely', surfaceForm: 'rely', pos: 'verb', freqRank: 1, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }], cefr: 'B1', register: 'usable',
      topic: 'other', meaningIt: 'contare su', explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false },
    { id: 'w2', lemma: 'reliable', surfaceForm: 'reliable', pos: 'adjective', freqRank: 0, songId: 's1', lineIndex: 0, contexts: [], cefr: 'B1', register: 'usable',
      topic: 'other', meaningIt: 'affidabile', explanationIt: '', extraExampleEn: 'x', triage: 'learn', userEdited: false, suspended: false, origin: 'expand', fromItemId: 'w1' },
  ])
  window.location.hash = '#/songs/s1?item=w1'
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Study songId="s1" itemId="w1" /></AppDepsProvider>)
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: 'Escludi' }))
  expect(await screen.findByText(/Con lei esce anche 1 voce aggiunta con Espandi\./)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Sì, escludi' }))
  await waitFor(async () => expect(await db.words.count()).toBe(0), { timeout: 3000 })
})

test('Studio aperto dall\'indirizzo su una canzone non ancora analizzata: lo dice, niente «Segna come completata»', async () => {
  await db.songs.update('s1', { status: 'draft' })
  mount()
  expect(await screen.findByText(/non è ancora stata analizzata/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Altre azioni' })).toBeNull()
  expect(screen.queryByRole('menuitem', { name: /Segna come completata/ })).toBeNull()
  expect((await db.songs.get('s1'))!.status).toBe('draft')
})

test('una parola su due righe della stessa canzone: la scheda mostra la riga toccata', async () => {
  await db.songs.update('s1', { lines: ['Every night I let it slide', 'and every night the harbour sleeps'] })
  await db.words.add({ id: 'night', lemma: 'night', surfaceForm: 'night', pos: 'noun', freqRank: 900, songId: 's1', lineIndex: 0,
    contexts: [{ songId: 's1', lineIndex: 0 }, { songId: 's1', lineIndex: 1 }], cefr: 'B1', register: 'usable', topic: '', meaningIt: 'notte',
    explanationIt: '', extraExampleEn: '', triage: 'learn', userEdited: false, suspended: false })
  const { container } = mount()
  await screen.findByText(/harbour/)
  const second = [...container.querySelectorAll<HTMLAnchorElement>('.lyrics p')][1].querySelector('a')!
  expect(second.getAttribute('href')).toBe('#/songs/s1?item=night%401')
  cleanup()
  window.location.hash = '#/songs/s1?item=night%401'
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Study songId="s1" itemId="night@1" /></AppDepsProvider>)
  await screen.findByRole('dialog')
  expect(screen.getByText('NELLA CANZONE · RIGA 2')).toBeTruthy()
})

test('Chiedi a Gemini: mentre la richiesta è in corso le parole e «Annulla» non si toccano', async () => {
  const { saveSettings } = await import('../../src/domain/settings')
  await saveSettings(db, { apiKey: 'k' })
  let release!: () => void
  const slow = (() => new Promise<Response>((r) => { release = () => r(new Response('{}', { status: 400 })) })) as unknown as typeof fetch
  window.location.hash = '#/songs/s1'
  render(<AppDepsProvider value={{ db, fetch: slow, sleep: async () => {}, now: () => now }}><Study songId="s1" /></AppDepsProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a Gemini' }))
  fireEvent.click(await screen.findByRole('button', { name: 'night' }))
  fireEvent.click(screen.getByRole('button', { name: 'Chiedi a Gemini' }))
  await screen.findByRole('button', { name: 'Chiedo…' })
  expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getAllByRole('button', { name: 'Every' })[0] as HTMLButtonElement).disabled).toBe(true)
  await waitFor(() => expect(release).toBeTypeOf('function'))
  release()
})

describe('cover in the Study header', () => {
  const TRACK = 'https://open.spotify.com/track/abc123'
  const THUMB = 'https://i.scdn.co/image/ab67616d00001e02aaaa'
  const withFetch = (fetchFn: typeof fetch) =>
    render(
      <AppDepsProvider value={{ db, fetch: fetchFn, sleep: async () => {}, now: () => now }}>
        <Study songId="s1" />
      </AppDepsProvider>,
    )
  const okFetch = () =>
    vi.fn(async () => new Response(JSON.stringify({ title: 'T', thumbnail_url: THUMB }), { status: 200 })) as unknown as typeof fetch

  test('fetches the cover once, saves it and shows the image in the header', async () => {
    await db.songs.update('s1', { spotifyUrl: TRACK })
    const f = okFetch()
    const { container } = withFetch(f)
    await waitFor(async () => expect((await db.songs.get('s1'))!.coverUrl).toBe(THUMB))
    await waitFor(() => expect(container.querySelector('.settings-head img')?.getAttribute('src')).toBe(THUMB))
    expect(f).toHaveBeenCalledTimes(1)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`https://open.spotify.com/oembed?url=${encodeURIComponent(TRACK)}`)
    expect(container.querySelector('.settings-head .cover-lg')).toBeTruthy()
  })

  test('header carries the song hue', async () => {
    const { container } = withFetch(okFetch())
    await screen.findByRole('heading', { name: 'Night Song' })
    expect(container.querySelector('.settings-head.song-hue-' + songLook('s1').hue)).toBeTruthy()
  })

  test('a song without a Spotify link makes no request and shows the generated cover', async () => {
    const f = okFetch()
    const { container } = withFetch(f)
    await screen.findByRole('heading', { name: 'Night Song' })
    await new Promise((r) => setTimeout(r, 30))
    expect(f).not.toHaveBeenCalled()
    expect(container.querySelector('.settings-head img')).toBeNull()
    expect(container.querySelector('.settings-head .cover')).toBeTruthy()
  })

  test('a text makes no request even with a stray link', async () => {
    await db.songs.update('s1', { kind: 'text', spotifyUrl: TRACK })
    const f = okFetch()
    withFetch(f)
    await screen.findByRole('heading', { name: 'Night Song' })
    await new Promise((r) => setTimeout(r, 30))
    expect(f).not.toHaveBeenCalled()
  })

  test('a rejected fetch leaves no alert, no saved cover, and the generated cover', async () => {
    await db.songs.update('s1', { spotifyUrl: TRACK })
    errors.dismiss()
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const { container } = withFetch(f)
    await screen.findByRole('heading', { name: 'Night Song' })
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 30))
    expect(errors.get()).toBeNull()
    expect((await db.songs.get('s1'))!.coverUrl).toBeUndefined()
    expect(container.querySelector('.settings-head img')).toBeNull()
    expect(container.querySelector('.settings-head .cover')).toBeTruthy()
  })
})

describe('percorso e testata', () => {
  const DAY = 86_400_000
  const pendingWord = (id: string, lemma: string) => ({
    id, lemma, surfaceForm: lemma, pos: 'noun', freqRank: 9000, songId: 's1', lineIndex: 0, contexts: [{ songId: 's1', lineIndex: 0 }],
    cefr: 'B2' as const, register: 'usable' as const, topic: '', meaningIt: 'x', explanationIt: '', extraExampleEn: '',
    triage: 'pending' as const, userEdited: false, suspended: false,
  })
  const path = async () => screen.findByRole('list', { name: 'Percorso della canzone' })

  test('riascolto pronto e 2 parole da smistare: Smista e Riascolto sono link, le altre tappe no', async () => {
    await db.songs.update('s1', { studyStartedAt: new Date(now.getTime() - 8 * DAY), comprehensionBefore: 40 })
    await db.words.bulkAdd([pendingWord('w1', 'every'), pendingWord('w2', 'slide')])
    mount()
    const list = await path()
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    const smista = await within(list).findByRole('link', { name: 'Smista, in corso, 2 da fare' })
    expect(smista.getAttribute('href')).toBe('#/songs/s1/triage')
    expect(within(list).getByRole('link', { name: 'Riascolto, ora, pronto' }).getAttribute('href')).toBe('#/songs/s1/final')
    expect(within(list).getAllByRole('link')).toHaveLength(3) // + Studio: Leggi a tempo
    expect(within(list).getAllByRole('listitem')[0].textContent).toBe('Ascolto, fatta, 40%')
  })

  test('senza parole da smistare e riascolto lontano: solo lo Studio ha un link (la lettura)', async () => {
    mount()
    const list = await path()
    expect(within(list).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['#/songs/s1/read'])
    expect(within(list).getAllByRole('listitem')[5].textContent).toBe('Riascolto, da fare, tra 7 giorni')
  })

  test('la tappa Studio porta a «Leggi a tempo»; con la data di lettura la mostra', async () => {
    mount()
    let list = await path()
    expect((await within(list).findByRole('link', { name: 'Studio, fatta, Leggi a tempo' })).getAttribute('href')).toBe('#/songs/s1/read')
    cleanup()
    await db.songs.update('s1', { readAlongAt: new Date('2026-11-05T09:00:00') })
    mount()
    list = await path()
    expect((await within(list).findByRole('link', { name: 'Studio, fatta, letta il 5 novembre, Leggi a tempo' })).getAttribute('href')).toBe('#/songs/s1/read')
  })

  test('un testo libero dice «Leggi riga per riga»', async () => {
    await db.songs.update('s1', { kind: 'text', source: 'podcast' })
    mount()
    const list = await path()
    expect((await within(list).findByRole('link', { name: 'Studio, fatta, Leggi riga per riga' })).getAttribute('href')).toBe('#/songs/s1/read')
  })

  test('«Apri in Spotify ↗» sta nella testata', async () => {
    await db.songs.update('s1', { spotifyUrl: 'https://open.spotify.com/track/abc123' })
    const { container } = mount()
    await screen.findByRole('heading', { name: 'Night Song' })
    const head = container.querySelector<HTMLElement>('.study-head')!
    const a = await within(head).findByRole('link', { name: 'Apri in Spotify ↗' })
    expect(a.getAttribute('href')).toBe('https://open.spotify.com/track/abc123')
    expect(screen.getAllByRole('link', { name: 'Apri in Spotify ↗' })).toHaveLength(1)
    expect(container.querySelector('.study-artist')!.textContent).toBe('A')
  })

  test('«Cerca il testo su Google ↗» nella testata, per controllare il testo incollato', async () => {
    const { container } = mount()
    await screen.findByRole('heading', { name: 'Night Song' })
    const head = container.querySelector<HTMLElement>('.study-head')!
    const a = within(head).getByRole('link', { name: 'Cerca il testo su Google ↗' })
    expect(a.getAttribute('href')).toBe('https://www.google.com/search?q=Night+Song+A+lyrics')
    expect(a.getAttribute('target')).toBe('_blank')
  })

  test('«Chiedi a Gemini» è un pulsante fluttuante che sparisce mentre si sceglie', async () => {
    const { container } = mount()
    const btn = await screen.findByRole('button', { name: 'Chiedi a Gemini' })
    expect(btn.closest('.study-ask')).toBeTruthy()
    fireEvent.click(btn)
    expect(container.querySelector('.study-ask')).toBeNull()
    // resta solo quello della barra
    expect(screen.getAllByRole('button', { name: 'Chiedi a Gemini' })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Da chiedere a Gemini' })).getByRole('button', { name: 'Chiedi a Gemini' })).toBeTruthy()
  })

  test('menu «⋯»: Elimina canzone chiede ancora conferma; Annulla non elimina', async () => {
    mount()
    await fromMenu('Elimina canzone')
    expect(screen.getByRole('alertdialog', { name: 'Conferma eliminazione' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(await db.songs.get('s1')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('testo libero: 5 tappe con «Lettura», niente Riascolto né Spotify', async () => {
    await db.songs.update('s1', { kind: 'text', source: 'podcast', spotifyUrl: 'https://open.spotify.com/track/abc123' })
    mount()
    const list = await path()
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[0].textContent).toBe('Lettura, da fare')
    expect(list.textContent).not.toContain('Riascolto')
    expect(screen.queryByRole('link', { name: /Apri in Spotify/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Cerca il testo/ })).toBeNull()
  })
})
