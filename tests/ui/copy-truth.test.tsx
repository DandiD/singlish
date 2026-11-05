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

test('i messaggi di Gemini valgono per ogni richiesta, non solo per l\'analisi di una canzone', async () => {
  const { geminiProblem } = await import('../../src/ui/errors')
  const { GeminiError } = await import('../../src/domain/gemini/client')
  expect(geminiProblem(new Error('x'), 'm').title).not.toMatch(/Analisi/)
  expect(geminiProblem(new GeminiError('blocked', 'x'), 'm').text).not.toMatch(/canzone/)
})

test('Aggiungi testo parla di un testo, non di una canzone', async () => {
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><AddSong kind="text" /></AppDepsProvider>)
  expect(await screen.findByText(/offline\? Lo salviamo e lo analizziamo dopo/)).toBeTruthy()
})

test('Studio di un testo: completare ed eliminare parlano di un testo', async () => {
  const { Study } = await import('../../src/ui/screens/Study')
  const { fireEvent } = await import('@testing-library/preact')
  await db.songs.add({ id: 't1', kind: 'text', source: 'serie', title: 'Episodio', artist: '', spotifyUrl: null, lines: ['we drop the ball'], status: 'studying', level: 'B2',
    difficultyKnownPct: 70, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now, analyzedAt: now })
  window.location.hash = '#/songs/t1'
  render(<AppDepsProvider value={{ db, fetch: (async () => new Response('')) as unknown as typeof fetch, sleep: async () => {}, now: () => now }}><Study songId="t1" /></AppDepsProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Segna come completato' }))
  expect(screen.getByText(/Segnare questo testo come completato\?/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
  expect(screen.getByRole('button', { name: 'Elimina testo' })).toBeTruthy()
})

test('Espandi, Sessione vuota, Le tue frasi e prova offline dicono il vero', () => {
  const expand = readFileSync('src/ui/screens/Expand.tsx', 'utf8')
  expect(expand).toContain('le voci nuove entrano dopo chunk e parole delle canzoni')
  const session = readFileSync('src/ui/screens/Session.tsx', 'utf8')
  expect(session).not.toContain('Le card nuove arrivano quando apri lo Studio')
  expect(session).toContain('possono entrare nel ripasso')
  const feedback = readFileSync('src/ui/screens/Feedback.tsx', 'utf8')
  expect(feedback).not.toContain('arrivano qui a fine sessione')
  const settings = readFileSync('src/ui/screens/Settings.tsx', 'utf8')
  expect(settings).toContain('la chiave non è stata provata né salvata')
  expect(settings).toContain('Il modello salvato è')
  const unlock = readFileSync('src/ui/components/UnlockSheet.tsx', 'utf8')
  expect(unlock).toContain('Il prossimo testo non è ancora pronto')
  const analyzing = readFileSync('src/ui/screens/Analyzing.tsx', 'utf8')
  expect(analyzing).toContain('Studialo ora')
  const songs = readFileSync('src/ui/screens/Songs.tsx', 'utf8')
  expect(songs).toContain("aggiunto il")
})

test('il badge di un testo completato è al maschile', async () => {
  const { statusLabel } = await import('../../src/ui/screens/Songs')
  expect(statusLabel('done', 'text')).toBe('Completato')
  expect(statusLabel('done')).toBe('Completata')
})

test('testi su testi liberi, sessione vuota, Escludi, riascolto e badge offline dicono il vero', () => {
  const unlock = readFileSync('src/ui/components/UnlockSheet.tsx', 'utf8')
  expect(unlock).toContain("target === 'addText' ? 'Le card nuove del testo'")
  const study = readFileSync('src/ui/screens/Study.tsx', 'utf8')
  expect(study).toContain('ALTRE VOCI DI QUESTO TESTO')
  const session = readFileSync('src/ui/screens/Session.tsx', 'utf8')
  expect(session).toContain('possono arrivare quando smisti le parole nello Studio')
  expect(session).toContain('Hai canzoni o testi ancora da analizzare')
  const sheet = readFileSync('src/ui/screens/ItemSheet.tsx', 'utf8')
  expect(sheet).toContain('e rientra nella tua fascia')
  const fl = readFileSync('src/ui/screens/FinalListen.tsx', 'utf8')
  expect(fl).toContain('gli altri si sbloccano con le prossime sessioni')
  const badge = readFileSync('src/ui/components/OfflineBadge.tsx', 'utf8')
  expect(badge).not.toContain('il resto funziona')
})

test('sblocco: il carico mostrato non contraddice «sotto/oltre» al limite', async () => {
  const { loadLabel } = await import('../../src/ui/components/UnlockSheet')
  expect(loadLabel(30.3, 30)).toBe('30,3')
  expect(loadLabel(29.6, 30)).toBe('29,6')
  expect(loadLabel(12.4, 30)).toBe('12')
  expect(loadLabel(30, 30)).toBe('30')
})

test('etichetta «Altre voci» e ritorno del fuoco con indirizzo id@riga', () => {
  const study = readFileSync('src/ui/screens/Study.tsx', 'utf8')
  expect(study).not.toContain('aria-label="Altre voci di questa canzone"')
  const sheet = readFileSync('src/ui/screens/ItemSheet.tsx', 'utf8')
  expect(sheet).toContain('item=${encodeURIComponent(itemId)}%40')
})

test('carico: Progressi e sblocco lo scrivono allo stesso modo; al tetto si dice «entro»', () => {
  const progress = readFileSync('src/ui/screens/Progress.tsx', 'utf8')
  expect(progress).toContain('loadLabel(p.loadMinutesPerDay, minutes)')
  const unlock = readFileSync('src/ui/components/UnlockSheet.tsx', 'utf8')
  expect(unlock).toContain("r.loadOk ? 'entro' : 'oltre'")
})

test('l\'errore «bloccato» vale per ogni richiesta a Gemini', async () => {
  const { geminiProblem } = await import('../../src/ui/errors')
  const { GeminiError } = await import('../../src/domain/gemini/client')
  const p = geminiProblem(new GeminiError('blocked', 'x'), 'm')
  expect(p.title).toBe('Gemini ha fermato la richiesta')
  expect(p.text).not.toMatch(/testo diverso/)
})

test('la card Produci dice dove arriva davvero la correzione', () => {
  const session = readFileSync('src/ui/screens/Session.tsx', 'utf8')
  expect(session).not.toContain('La correzione arriva a fine sessione')
  expect(session).toContain('La correggi con Gemini da «Le tue frasi»')
})

test('carico appena sopra o sotto il tetto: il decimale va dalla parte giusta', async () => {
  const { loadLabel } = await import('../../src/ui/components/UnlockSheet')
  expect(loadLabel(30.02, 30)).toBe('30,1')
  expect(loadLabel(29.98, 30)).toBe('29,9')
})

test('Progressi si ricalcola al cambio di giorno come Oggi', () => {
  const progress = readFileSync('src/ui/screens/Progress.tsx', 'utf8')
  expect(progress).toContain('useDayTick(now)')
})

test('senza View Transitions, scroll e fuoco vanno solo alla pagina che è ancora quella (due navigazioni ravvicinate)', () => {
  const router = readFileSync('src/router.ts', 'utf8')
  expect(router).toContain('void settled(1000).then(() => { if (current.current === next) after() })')
})
