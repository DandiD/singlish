import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Analyzing } from '../../src/ui/screens/Analyzing'
import { createSong } from '../../src/domain/ingest'
import { resetRanksCache } from '../../src/domain/freq'
import { saveSettings } from '../../src/domain/settings'
import type { Analysis } from '../../src/domain/gemini/parse'
import fixtureJson from '../fixtures/analysis.json'
import tenLines from '../fixtures/lyrics.txt?raw'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')
const input = { title: 'Night Song', artist: 'A', spotifyUrl: null, rawText: tenLines, comprehensionBefore: 40 }

const freqList = (() => {
  const l = Array.from({ length: 6000 }, (_, i) => 'w' + i)
  l[5999] = 'flicker'
  l[2999] = 'wander'
  l[3999] = 'shadow'
  return l
})()

function makeFetch(geminiRes: () => Response) {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('freq.json')) return new Response(JSON.stringify(freqList), { status: 200 })
    return geminiRes()
  }) as unknown as typeof fetch
}
const geminiCalls = (f: typeof fetch) =>
  (f as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => !String(c[0]).includes('freq.json')).length
const okAnalysis = (pct: number) => () =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ ...(fixtureJson as Analysis), difficulty_known_pct: pct }) }] } },
      ],
    }),
  )

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

function mount(songId: string, f: typeof fetch) {
  return render(
    <AppDepsProvider value={{ db, fetch: f, sleep: async () => {}, now: () => now }}>
      <Analyzing songId={songId} />
    </AppDepsProvider>,
  )
}

beforeEach(async () => {
  db = createDb('t-' + crypto.randomUUID())
  resetRanksCache()
  setOnline(true)
  window.location.hash = ''
  await saveSettings(db, { apiKey: 'k', level: 'B2', bandStart: 3000, bandEnd: 8000 })
})
afterEach(() => {
  cleanup()
  db.close()
  setOnline(true)
})

describe('Analyzing', () => {
  test('low difficulty shows warning; Studiala ora goes to triage with pending words', async () => {
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(okAnalysis(45)))
    await screen.findByText('Capiresti il 45%: puoi studiarla lo stesso o tenerla per più avanti')
    fireEvent.click(screen.getByRole('button', { name: 'Studiala ora' }))
    await waitFor(() => expect(window.location.hash).toBe(`#/songs/${song.id}/triage`))
    expect((await db.songs.get(song.id))!.status).toBe('studying')
  })

  test('offline: song is queued without calling the network', async () => {
    setOnline(false)
    const song = await createSong(db, input, now)
    const f = vi.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch
    mount(song.id, f)
    await screen.findByRole('heading', { name: 'Sei offline' })
    expect(screen.getByText(/La canzone è salvata\. La analizzo quando riapri l'app con la connessione\./)).toBeTruthy()
    expect((await db.songs.get(song.id))!.status).toBe('queued')
  })

  test('online but freq.json fails: song is queued', async () => {
    const song = await createSong(db, input, now)
    const f = vi.fn(async () => {
      throw new TypeError('down')
    }) as unknown as typeof fetch
    mount(song.id, f)
    await screen.findByRole('heading', { name: 'Sei offline' })
    expect((await db.songs.get(song.id))!.status).toBe('queued')
  })

  test('Gemini occupato (429 dopo i ritentativi): in coda, con il motivo e «Riprova ora»', async () => {
    const song = await createSong(db, input, now)
    let busy = true
    const f = makeFetch(() => (busy ? new Response('', { status: 429 }) : okAnalysis(80)()))
    mount(song.id, f)
    await screen.findByRole('heading', { name: 'Gemini è occupato' })
    expect(screen.getByText(/La canzone è salvata e resta in coda/)).toBeTruthy()
    expect((await db.songs.get(song.id))!.status).toBe('queued')
    busy = false
    fireEvent.click(screen.getByRole('button', { name: 'Riprova ora' }))
    await screen.findByText('Analisi completata')
  })

  test('chiave rifiutata: lo dice e porta alle Impostazioni', async () => {
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(() => new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })))
    await screen.findByRole('heading', { name: 'La chiave Gemini non funziona' })
    expect(screen.getByRole('link', { name: 'Vai a Impostazioni' }).getAttribute('href')).toBe('#/settings')
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull()
  })

  test('modello inesistente: nomina il modello', async () => {
    await saveSettings(db, { model: 'gemini-zzz' })
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(() => new Response('{}', { status: 404 })))
    await screen.findByRole('heading', { name: 'Il modello «gemini-zzz» non esiste' })
  })

  test('testo bloccato dai filtri: lo spiega e permette di riprovare', async () => {
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(() => new Response(JSON.stringify({ candidates: [{ finishReason: 'RECITATION' }] }))))
    await screen.findByRole('heading', { name: 'Gemini ha fermato la richiesta' })
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy()
  })

  test('canzone eliminata nel frattempo: lo dice', async () => {
    mount('non-esiste', makeFetch(okAnalysis(80)))
    await screen.findByRole('heading', { name: 'Canzone non trovata' })
  })

  test('no_key shows link to settings', async () => {
    await saveSettings(db, { apiKey: '' })
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(okAnalysis(80)))
    const link = await screen.findByRole('link', { name: /Impostazioni/ })
    expect(link.getAttribute('href')).toBe('#/settings')
  })

  test('bad_json shows retry message', async () => {
    const song = await createSong(db, input, now)
    mount(song.id, makeFetch(() => new Response(JSON.stringify({ candidates: [] }), { status: 200 })))
    await screen.findByRole('heading', { name: 'Risposta di Gemini incompleta' })
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy()
  })

  test('already finished song does not call Gemini; done hides Studiala ora', async () => {
    const song = await createSong(db, input, now)
    await db.songs.update(song.id, { status: 'done', difficultyKnownPct: 80 })
    const f = makeFetch(okAnalysis(80))
    mount(song.id, f)
    await screen.findByText('Analisi completata')
    expect(geminiCalls(f)).toBe(0)
    expect(screen.queryByRole('button', { name: 'Studiala ora' })).toBeNull()
  })

  test('already analyzed song does not call Gemini', async () => {
    const song = await createSong(db, input, now)
    await db.songs.update(song.id, { status: 'analyzed', difficultyKnownPct: 80 })
    const f = makeFetch(okAnalysis(80))
    mount(song.id, f)
    await screen.findByText('Analisi completata')
    expect(geminiCalls(f)).toBe(0)
  })
})

test('un testo libero offline: «Il testo è salvato», e i passi non parlano di pronuncia', async () => {
  setOnline(false)
  const t = await createSong(db, { ...input, kind: 'text', source: 'serie' }, now)
  mount(t.id, vi.fn(async () => { throw new TypeError('offline') }) as unknown as typeof fetch)
  await screen.findByRole('heading', { name: 'Sei offline' })
  expect(screen.getByText(/Il testo è salvato\./)).toBeTruthy()
  expect(screen.queryByText(/La canzone è salvata/)).toBeNull()
  setOnline(true)
})
