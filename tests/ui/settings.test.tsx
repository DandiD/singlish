import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { createDb, type SinglishDB } from '../../src/db/db'
import { AppDepsProvider } from '../../src/ui/deps'
import { Settings } from '../../src/ui/screens/Settings'
import { getSettings, saveSettings } from '../../src/domain/settings'
import { exportBackup } from '../../src/domain/backup'

let db: SinglishDB
const now = new Date('2026-10-31T10:00:00Z')

beforeEach(() => {
  db = createDb('t-' + crypto.randomUUID())
})
afterEach(() => {
  cleanup()
  db.close()
  delete document.documentElement.dataset.theme
})

function mount(fakeFetch: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return render(
    <AppDepsProvider value={{ db, fetch: fakeFetch, sleep: async () => {}, now: () => now }}>
      <Settings />
    </AppDepsProvider>,
  )
}

/** Scrive nel campo e lo lascia, come sul telefono (con preact/compat onBlur ascolta focusout). */
const leave = (el: Element, value: string) => { fireEvent.input(el, { target: { value } }); fireEvent.focusOut(el) }
const okBody = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })

describe('Settings', () => {
  test('Vibrazione switch is on without the field; turning it off saves haptics false', async () => {
    mount()
    const box = (await screen.findByRole('checkbox', { name: 'Vibrazione' })) as HTMLInputElement
    expect(box.checked).toBe(true)
    const note = document.getElementById(box.getAttribute('aria-describedby') ?? '')
    expect(note?.textContent).toMatch(/^Una vibrazione brevissima/)
    fireEvent.click(box)
    await waitFor(async () => expect((await getSettings(db)).haptics).toBe(false))
    fireEvent.click(box)
    await waitFor(async () => expect((await getSettings(db)).haptics).toBe(true))
  })

  test('changing level to B2 updates settings and band', async () => {
    mount()
    const select = (await screen.findByLabelText('Livello')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'B2' } })
    await waitFor(async () => {
      const s = await getSettings(db)
      expect(s.level).toBe('B2')
      expect([s.bandStart, s.bandEnd]).toEqual([3000, 8000])
    })
  })

  test('Prova with 200 saves key and shows Chiave valida', async () => {
    const f = vi.fn(async () => okBody()) as unknown as typeof fetch
    mount(f)
    const input = (await screen.findByLabelText('Chiave API')) as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.input(input, { target: { value: 'KEY123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText('Chiave valida, salvata.')
    expect((await getSettings(db)).apiKey).toBe('KEY123')
  })

  test('a pasted key with spaces or a newline is trimmed before testing and saving', async () => {
    const f = vi.fn(async () => okBody()) as unknown as typeof fetch
    mount(f)
    fireEvent.input(await screen.findByLabelText('Chiave API'), { target: { value: '  KEY123\n' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText('Chiave valida, salvata.')
    expect((await getSettings(db)).apiKey).toBe('KEY123')
    const init = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('KEY123')
  })

  test('Prova with 400 saves nothing and shows error', async () => {
    const f = vi.fn(async () => new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })) as unknown as typeof fetch
    mount(f)
    const input = await screen.findByLabelText('Chiave API')
    fireEvent.input(input, { target: { value: 'BAD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    await screen.findByText(/^La chiave Gemini non funziona\. .*La chiave non è stata salvata\. Il modello salvato è «.+»\.$/)
    expect((await getSettings(db)).apiKey).toBe('')
  })

  test('stored key + empty field: Prova tests the stored key with the typed model and saves the model only', async () => {
    await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
    const f = vi.fn(async () => okBody()) as unknown as typeof fetch
    const { container } = mount(f)
    const keyInput = (await screen.findByLabelText('Chiave API')) as HTMLInputElement
    expect(keyInput.value).toBe('')
    expect(container.innerHTML).not.toContain('STORED')
    fireEvent.input(screen.getByLabelText('Modello'), { target: { value: 'new-model' } })
    const btn = screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    await screen.findByText('Chiave valida, salvata.')
    const call = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toContain('new-model')
    expect(JSON.stringify(call)).toContain('STORED')
    const s = await getSettings(db)
    expect(s.apiKey).toBe('STORED')
    expect(s.model).toBe('new-model')
    expect(container.innerHTML).not.toContain('STORED')
  })

  test('stored key + empty field: failing Prova does not touch the key', async () => {
    await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
    const f = vi.fn(async () => new Response('{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}', { status: 400 })) as unknown as typeof fetch
    mount(f)
    await screen.findByLabelText('Chiave API')
    fireEvent.input(screen.getByLabelText('Modello'), { target: { value: 'new-model' } })
    // toccando Prova il campo perde il fuoco: il modello (una preferenza) si salva da solo, come le altre
    leave(screen.getByLabelText('Modello'), 'new-model')
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    // il messaggio dice il vero: la chiave rifiutata non si salva, il modello salvato è quello nuovo
    await screen.findByText(/^La chiave Gemini non funziona\. .*È la chiave salvata: sostituiscila con una che funziona\. Il modello salvato è «new-model»\.$/)
    expect(screen.queryByText(/Nulla è stato salvato/)).toBeNull()
    expect((await getSettings(db)).apiKey).toBe('STORED')
    expect((await getSettings(db)).model).toBe('new-model')
  })

  test('no stored key and empty field: Prova stays disabled', async () => {
    mount()
    await screen.findByLabelText('Chiave API')
    expect((screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('theme change applies to documentElement', async () => {
    mount()
    fireEvent.click(await screen.findByRole('radio', { name: 'Scuro' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    await waitFor(async () => expect((await getSettings(db)).theme).toBe('dark'))
  })

  test('il tema del backup importato si applica subito, come quello scelto qui', async () => {
    await saveSettings(db, { theme: 'dark' })
    const file = new File([JSON.stringify(await exportBackup(db, now))], 'b.json', { type: 'application/json' })
    await saveSettings(db, { theme: 'light' })
    document.documentElement.dataset.theme = 'light'
    const { container } = mount()
    await screen.findByLabelText('Livello')
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Sostituisci' }))
    await screen.findByText('Backup importato.')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  test('import cancel leaves data untouched', async () => {
    await saveSettings(db, { newPerDay: 20 })
    const { container } = mount()
    await screen.findByLabelText('Livello')
    const file = new File([JSON.stringify(await exportBackup(db, now))], 'b.json', { type: 'application/json' })
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText('Sostituire tutti i dati?')
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(screen.queryByText('Sostituire tutti i dati?')).toBeNull())
    expect((await getSettings(db)).newPerDay).toBe(20)
  })

  const tryKey = async (res: () => Response | Promise<Response>) => {
    const f = vi.fn(async () => res()) as unknown as typeof fetch
    mount(f)
    fireEvent.input(await screen.findByLabelText('Chiave API'), { target: { value: 'K' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    return f
  }

  test('offline: dice che la chiave non è stata provata, senza chiamare la rete', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    try {
      const f = await tryKey(okBody)
      await screen.findByText(/^Sei offline: la chiave non è stata provata né salvata\. Il modello salvato è «.+»\.$/)
      expect(f).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    }
  })

  test('rete che cade durante la prova: non dice «chiave non valida»', async () => {
    await tryKey(() => { throw new TypeError('Failed to fetch') })
    await screen.findByText(/^Gemini non risponde\. Controlla la connessione e riprova\. La chiave non è stata salvata\. Il modello salvato è «.+»\.$/)
  })

  test('Gemini occupato (429): la chiave è buona, si salva subito e lo dice', async () => {
    const f = await tryKey(() => new Response('', { status: 429 }))
    await screen.findByText(/^Chiave salvata\. Gemini però è occupato/)
    expect(f).toHaveBeenCalledTimes(1)
    expect((await getSettings(db)).apiKey).toBe('K')
  })

  test('modello inesistente: lo nomina e non salva', async () => {
    await tryKey(() => new Response('{}', { status: 404 }))
    await screen.findByText(/^Il modello «gemini-flash-lite-latest» non esiste\./)
    expect((await getSettings(db)).apiKey).toBe('')
  })

  test('durante la prova lo dice', async () => {
    await tryKey(() => new Promise<Response>(() => {}))
    await screen.findByText('Provo la chiave…')
  })

  test('un file che non è un backup viene scartato subito, con un messaggio chiaro', async () => {
    const { container } = mount()
    await screen.findByLabelText('Livello')
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    for (const body of ['{"anything":1}', 'not json at all']) {
      fireEvent.change(input, { target: { files: [new File([body], 'x.json')] } })
      await screen.findByText(/^Questo file non è un backup di Singlish\./)
      expect(screen.queryByText('Sostituire tutti i dati?')).toBeNull()
    }
  })

  test('importazione riuscita e non riuscita: messaggi completi', async () => {
    const { container } = mount()
    await screen.findByLabelText('Livello')
    const good = await exportBackup(db, now)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(good)], 'b.json')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Sostituisci' }))
    await screen.findByText('Backup importato.')

    // Due canzoni con lo stesso id: il database rifiuta, la transazione torna indietro.
    const song = { id: 's', kind: 'song', title: 'T', artist: '', spotifyUrl: null, lines: [], status: 'studying', level: 'B1',
      difficultyKnownPct: null, comprehensionBefore: null, grammarPoint: null, connectedSpeech: [], addedAt: now.toISOString(), analyzedAt: null }
    const broken = { ...good, tables: { ...good.tables, songs: [song, song] } }
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(broken)], 'b.json')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Sostituisci' }))
    await screen.findByText(/^Importazione non riuscita: i tuoi dati non sono cambiati\./)
  })
})

describe('nessun valore perso nelle Impostazioni', () => {
  test('il modello si salva da solo, senza spazi, anche senza Prova', async () => {
    mount()
    const model = (await screen.findByLabelText('Modello')) as HTMLInputElement
    fireEvent.input(model, { target: { value: ' gemini-2.5-flash ' } })
    leave(model, ' gemini-2.5-flash ')
    await waitFor(async () => expect((await getSettings(db)).model).toBe('gemini-2.5-flash'))
  })
  test('un modello cancellato non si salva vuoto: torna quello salvato', async () => {
    await saveSettings(db, { model: 'gemini-a' })
    mount()
    const model = (await screen.findByLabelText('Modello')) as HTMLInputElement
    fireEvent.input(model, { target: { value: '  ' } })
    leave(model, '  ')
    await waitFor(() => expect(model.value).toBe('gemini-a'))
    expect((await getSettings(db)).model).toBe('gemini-a')
  })
  test('un numero cancellato torna al valore salvato; fuori limite si ferma al limite', async () => {
    await saveSettings(db, { newPerDay: 16 })
    mount()
    const n = (await screen.findByLabelText('Nuove al giorno')) as HTMLInputElement
    leave(n, '')
    expect(n.value).toBe('16')
    leave(n, '500')
    await waitFor(async () => expect((await getSettings(db)).newPerDay).toBe(40))
    expect(n.value).toBe('40')
    leave(n, '0')
    await waitFor(async () => expect((await getSettings(db)).newPerDay).toBe(1))
    const study = screen.getByLabelText('Studio') as HTMLInputElement
    const before = study.value
    leave(study, '')
    expect(study.value).toBe(before)
  })
  test('scrivendo durante la prova della chiave, si salva la chiave provata e il testo nuovo resta nel campo', async () => {
    let release!: () => void
    const slow = vi.fn(() => new Promise<Response>((r) => { release = () => r(okBody()) })) as unknown as typeof fetch
    mount(slow)
    const key = (await screen.findByLabelText('Chiave API')) as HTMLInputElement
    fireEvent.input(key, { target: { value: 'KEY-A' } })
    fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
    fireEvent.input(key, { target: { value: 'KEY-B' } })
    expect((screen.getByRole('button', { name: 'Prova' }) as HTMLButtonElement).disabled).toBe(true)
    release()
    await waitFor(async () => expect((await getSettings(db)).apiKey).toBe('KEY-A'))
    expect(key.value).toBe('KEY-B')
  })
})

test('memoria obiettivo: l\'etichetta segue il cursore mentre lo si trascina', async () => {
  mount()
  const slider = (await screen.findByLabelText(/Memoria obiettivo/)) as HTMLInputElement
  fireEvent.input(slider, { target: { value: '93' } })
  expect(screen.getByText(/Memoria obiettivo: 0,93/)).toBeTruthy()
})

test('memoria obiettivo: due scatti di fila salvano il secondo e l\'etichetta non torna indietro', async () => {
  mount()
  const slider = (await screen.findByLabelText(/Memoria obiettivo/)) as HTMLInputElement
  fireEvent.input(slider, { target: { value: '91' } })
  fireEvent.input(slider, { target: { value: '91' } }); fireEvent.pointerUp(slider)
  expect(slider.value).toBe('91')
  fireEvent.input(slider, { target: { value: '92' } })
  fireEvent.input(slider, { target: { value: '92' } }); fireEvent.pointerUp(slider)
  expect(screen.getByText(/Memoria obiettivo: 0,92/)).toBeTruthy()
  await waitFor(async () => expect((await getSettings(db)).desiredRetention).toBe(0.92))
  expect(screen.getByText(/Memoria obiettivo: 0,92/)).toBeTruthy()
})

test('le Impostazioni citano la fonte delle frequenze delle parole, come chiede la licenza', async () => {
  mount()
  await screen.findByLabelText('Livello')
  const credit = [...document.querySelectorAll('p')].find((p) => p.textContent!.startsWith('Frequenze delle parole: wordfreq'))!
  expect(credit.querySelector('a')!.getAttribute('href')).toBe('https://github.com/rspeer/wordfreq')
  expect(credit.textContent).toContain('CC BY-SA 4.0')
})

test('le Impostazioni mostrano la fascia utile in uso e da dove viene', async () => {
  await saveSettings(db, { level: 'B1' })
  await saveSettings(db, { bandStart: 3000, bandEnd: 8000 })
  mount()
  expect(await screen.findByText(/Fascia utile: 3\.000–8\.000, dal test di vocabolario/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Livello'), { target: { value: 'B2' } })
  expect(await screen.findByText(/Fascia utile: [\d.]+–[\d.]+, del livello B2/)).toBeTruthy()
})

test('la fascia del test resta «dal test» anche se coincide con quella del livello', async () => {
  await saveSettings(db, { level: 'B2' })
  const s = await getSettings(db)
  await saveSettings(db, { bandStart: s.bandStart, bandEnd: s.bandEnd, bandFromTest: true })
  mount()
  expect(await screen.findByText(/dal test di vocabolario/)).toBeTruthy()
})

test('prova della chiave salvata con un modello sbagliato: non dà la colpa alla chiave', async () => {
  await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
  const f = vi.fn(async () => new Response('{"error":{"code":404}}', { status: 404 })) as unknown as typeof fetch
  mount(f)
  await screen.findByLabelText('Chiave API')
  fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
  await screen.findByText(/La chiave salvata non è cambiata\. Il modello salvato è «old-model»\.$/)
  expect(screen.queryByText(/sostituiscila/)).toBeNull()
})

test('prova offline con la chiave già salvata: non dice che non è salvata', async () => {
  await saveSettings(db, { apiKey: 'STORED' })
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  mount()
  await screen.findByLabelText('Chiave API')
  fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
  await screen.findByText(/^Sei offline: la chiave salvata non è stata provata\. Il modello salvato è «.+»\.$/)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

test('una chiave scritta e non provata: la pagina dice che si salva con «Prova»', async () => {
  mount()
  fireEvent.input(await screen.findByLabelText('Chiave API'), { target: { value: 'NEWKEY' } })
  expect(screen.getByText(/La chiave si salva quando tocchi «Prova»/)).toBeTruthy()
})

test('i numeri si salvano lasciando il campo, non a ogni tasto: correggere 16 in 20 salva 20', async () => {
  await saveSettings(db, { newPerDay: 16 })
  mount()
  const field = (await screen.findByLabelText('Nuove al giorno')) as HTMLInputElement
  await waitFor(() => expect(field.value).toBe('16'))
  for (const v of ['1', '', '2', '20']) fireEvent.input(field, { target: { value: v } })
  await new Promise((r) => setTimeout(r, 20))
  expect((await getSettings(db)).newPerDay).toBe(16) // mentre si scrive non si salva nulla
  fireEvent.focusOut(field)
  await waitFor(async () => expect((await getSettings(db)).newPerDay).toBe(20))
})

test('il modello si salva lasciando il campo: cancellare e riscrivere non salva nomi a metà', async () => {
  await saveSettings(db, { model: 'abc' })
  mount()
  const field = (await screen.findByLabelText('Modello')) as HTMLInputElement
  for (const v of ['ab', 'a', '', 'x', 'xy', 'xyz']) fireEvent.input(field, { target: { value: v } })
  await new Promise((r) => setTimeout(r, 20))
  expect((await getSettings(db)).model).toBe('abc')
  fireEvent.focusOut(field)
  await waitFor(async () => expect((await getSettings(db)).model).toBe('xyz'))
})

test('modello scritto e «Prova» toccata subito: si prova e si salva il modello nuovo', async () => {
  await saveSettings(db, { apiKey: 'STORED', model: 'old-model' })
  const f = vi.fn(async () => okBody()) as unknown as typeof fetch
  mount(f)
  const field = await screen.findByLabelText('Modello')
  fireEvent.input(field, { target: { value: 'new-model' } })
  fireEvent.focusOut(field)
  fireEvent.click(screen.getByRole('button', { name: 'Prova' }))
  await screen.findByText(/Chiave valida, salvata/)
  expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('new-model')
  expect((await getSettings(db)).model).toBe('new-model')
})

test('un numero scritto non si perde se la pagina si ridisegna prima di lasciare il campo', async () => {
  await saveSettings(db, { newPerDay: 16 })
  mount()
  const field = (await screen.findByLabelText('Nuove al giorno')) as HTMLInputElement
  fireEvent.input(field, { target: { value: '25' } })
  await saveSettings(db, { theme: 'dark' }) // un altro salvataggio ridisegna la pagina
  await new Promise((r) => setTimeout(r, 30))
  expect(field.value).toBe('25')
  fireEvent.focusOut(field)
  await waitFor(async () => expect((await getSettings(db)).newPerDay).toBe(25))
})

test('uscendo dalle Impostazioni con un campo ancora aperto, quello scritto si salva', async () => {
  await saveSettings(db, { newPerDay: 16, model: 'old-model' })
  const { unmount } = mount()
  fireEvent.input(await screen.findByLabelText('Nuove al giorno'), { target: { value: '22' } })
  fireEvent.input(screen.getByLabelText('Modello'), { target: { value: 'other-model' } })
  unmount()
  await waitFor(async () => expect(await getSettings(db)).toMatchObject({ newPerDay: 22, model: 'other-model' }))
})

describe('Settings, weekly goal', () => {
  test('shows 5 when no goal is saved', async () => {
    mount()
    const select = (await screen.findByLabelText('Obiettivo settimanale')) as HTMLSelectElement
    expect(select.value).toBe('5')
    expect(screen.getByText('3 giorni su 7')).toBeTruthy()
    expect(screen.getByText('7 giorni su 7')).toBeTruthy()
    expect(screen.getByText('Un giorno conta se ripassi almeno una card, o se quel giorno non c\'era niente da ripassare.')).toBeTruthy()
  })

  test('changing it to 3 saves rhythmGoal', async () => {
    mount()
    const select = (await screen.findByLabelText('Obiettivo settimanale')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '3' } })
    await waitFor(async () => expect((await getSettings(db)).rhythmGoal).toBe(3))
  })
})
