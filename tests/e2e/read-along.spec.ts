import { expect, test } from '@playwright/test'

// Lettura a tempo a 390 px: Studio → «Leggi a tempo» → tocco a destra, tastiera, nuvoletta → «Letta tutta» → Studio. Dati inventati, nessuna rete.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

const LONG = 'and every single quiet evening of the whole wide winter keeps humming Supercalifragilisticexpialidocious-and-then-some-more-unbroken-letters along the harbour wall'

test('leggere riga per riga senza scroll orizzontale, fino a «Letta tutta»', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await page.evaluate(async (long) => {
    const DAY = 86_400_000
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('singlish')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const now = Date.now()
    const tx = db.transaction(['songs', 'chunks', 'settings'], 'readwrite')
    tx.objectStore('settings').put({
      id: 'settings', apiKey: 'fake-key-for-e2e', model: 'gemini-flash-lite-latest', theme: 'light', level: 'B1', bandStart: 2000, bandEnd: 5000,
      desiredRetention: 0.9, newPerDay: 16, timerMinutes: { study: 15, review: 30 }, persistAsked: true, installBannerDismissed: true,
    })
    tx.objectStore('songs').put({
      id: 's1', kind: 'song', title: 'Paper Sky', artist: 'Artista inventato', spotifyUrl: null, coverUrl: null,
      lines: ['we fold the paper sky', '', 'and wait for borrowed rain', 'the harbour hums a quiet tune', 'and wait for borrowed rain', long],
      lineTranslations: [], status: 'studying', level: 'B1', difficultyKnownPct: 50, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
      addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now - DAY),
    })
    tx.objectStore('chunks').put({
      id: 'c1', songId: 's1', key: 'fold the paper', baseForm: 'fold the paper', surfaceForm: 'fold the paper', lineIndex: 0,
      contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
      meaningIt: 'piegare la carta', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
      userEdited: false, suspended: false,
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  }, LONG)
  await page.reload() // la cache delle query di Dexie non vede le scritture dirette

  const noOverflow = async () => {
    const o = await page.evaluate(() => {
      const h = document.documentElement
      const r = document.querySelector('.read-along') as HTMLElement
      return { html: h.scrollWidth <= h.clientWidth, ra: r.scrollWidth <= r.clientWidth }
    })
    expect(o).toEqual({ html: true, ra: true })
  }

  await page.goto('/#/songs/s1')
  await expect(page.getByRole('heading', { name: 'Paper Sky' })).toBeVisible()
  await expect(page.locator('.song-path')).toBeVisible()
  // La colonna del percorso, con la terza riga piccola, sta nel suo contenitore.
  const path = await page.evaluate(() => {
    const p = document.querySelector('.song-path') as HTMLElement
    const pr = p.getBoundingClientRect()
    return { fits: p.scrollWidth <= p.clientWidth, inside: [...p.querySelectorAll('.path-link, .path-detail')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= pr.left - 1 && r.right <= pr.right + 1 }), html: document.documentElement.scrollWidth <= document.documentElement.clientWidth }
  })
  expect(path).toEqual({ fits: true, inside: true, html: true })

  await page.getByRole('link', { name: /Leggi a tempo/ }).click()
  await expect(page.getByRole('heading', { name: 'Leggi a tempo' })).toBeVisible()
  const current = page.locator('.ra-current')
  await expect(page.getByText('Riga 1 di 5')).toBeVisible()
  await expect(current).toContainText('we fold the paper sky')
  await noOverflow()

  // Una voce apre la nuvoletta e non cambia riga.
  await page.locator('.ra-line [role="button"]').first().click()
  await expect(page.locator('.ra-bubble')).toContainText('piegare la carta')
  await expect(page.getByText('Riga 1 di 5')).toBeVisible()

  // Tocco sulla metà destra: la prima chiude la nuvoletta, la seconda avanza (la riga vuota è saltata).
  const stage = await page.locator('.ra-stage').boundingBox()
  const y = stage!.y + 20
  await page.mouse.click(stage!.x + stage!.width - 10, y)
  await expect(page.locator('.ra-bubble')).toHaveCount(0)
  await expect(page.getByText('Riga 1 di 5')).toBeVisible()
  await page.mouse.click(stage!.x + stage!.width - 10, y)
  await expect(page.getByText('Riga 2 di 5')).toBeVisible()
  await expect(current).toContainText('and wait for borrowed rain')
  await expect(current).toContainText('ritornello')

  // Tastiera: avanti due volte, indietro una.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Riga 3 di 5')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Riga 4 di 5')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('Riga 3 di 5')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('Riga 5 di 5')).toBeVisible()
  await expect(current).toContainText('Supercalifragilistic')
  await noOverflow()

  // «Letta tutta» ignora i tocchi nei primi 400 ms dopo la comparsa dell'ultima riga (doppio tocco su «Avanti»).
  await page.waitForTimeout(450)
  await page.getByRole('button', { name: 'Letta tutta' }).click()
  await expect(page.getByRole('heading', { name: 'Paper Sky' })).toBeVisible()
  await expect(page.locator('.song-path')).toContainText(/letta il \d{1,2} \p{L}+/u)
})
