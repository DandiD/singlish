import { expect, test, type Page } from '@playwright/test'

// Percorso, scaffale e collezione a 390 px: Oggi → Studio → Smista → menu «⋯» → Canzoni → Lessico. Dati inventati, nessuna rete.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

const LONG_TITLE = 'The Extraordinarily Long Winded Ballad of Paper Skies and Borrowed Rain Over Quiet Harbours'

async function seed(page: Page) {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await page.evaluate(async (longTitle) => {
    const DAY = 86_400_000
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('singlish')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const now = Date.now()
    const tx = db.transaction(['songs', 'chunks', 'words', 'settings'], 'readwrite')
    tx.objectStore('settings').put({
      id: 'settings', apiKey: 'fake-key-for-e2e', model: 'gemini-flash-lite-latest', theme: 'light', level: 'B1', bandStart: 2000, bandEnd: 5000,
      desiredRetention: 0.9, newPerDay: 16, timerMinutes: { study: 15, review: 30 }, persistAsked: true, installBannerDismissed: true,
    })
    const base = { artist: 'Artista inventato', spotifyUrl: null, coverUrl: null, level: 'B1', grammarPoint: null, connectedSpeech: [], lineTranslations: [] }
    const lines = ['we fold the paper sky', 'and wait for borrowed rain', 'the harbour hums a quiet tune', 'while lanterns drift away', 'nobody counts the hours', 'we keep the window open']
    tx.objectStore('songs').put({
      ...base, id: 's1', kind: 'song', title: longTitle, lines, status: 'studying', difficultyKnownPct: 50, comprehensionBefore: 50,
      addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now - DAY),
    })
    tx.objectStore('songs').put({
      ...base, id: 's2', kind: 'song', title: 'Done Tune', lines: ['a tiny finished line'], status: 'done', difficultyKnownPct: 50,
      comprehensionBefore: 40, comprehensionAfter: 68, addedAt: new Date(now - 10 * DAY), analyzedAt: new Date(now - 9 * DAY), studyStartedAt: new Date(now - 9 * DAY),
    })
    tx.objectStore('songs').put({
      ...base, id: 's3', kind: 'text', source: 'podcast', artist: '', title: 'Morning Chat', lines: ['they shared a long story'], status: 'analyzed',
      difficultyKnownPct: 60, comprehensionBefore: null, addedAt: new Date(now - 2 * DAY), analyzedAt: new Date(now - 2 * DAY),
    })
    tx.objectStore('chunks').put({
      id: 'c1', songId: 's1', key: 'fold the paper', baseForm: 'fold the paper', surfaceForm: 'fold the paper', lineIndex: 0,
      contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: 'casa',
      meaningIt: 'piegare la carta', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
      userEdited: false, suspended: false,
    })
    const word = (id: string, lemma: string, lineIndex: number) => ({
      id, lemma, surfaceForm: lemma, pos: 'noun', freqRank: 3000, songId: 's1', lineIndex, contexts: [{ songId: 's1', lineIndex }], cefr: 'B1',
      register: 'usable', topic: 'mare', meaningIt: lemma, explanationIt: '', extraExampleEn: '', triage: 'pending', userEdited: false, suspended: false,
    })
    tx.objectStore('words').put(word('w1', 'harbour', 2))
    tx.objectStore('words').put(word('w2', 'lantern', 3))
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  }, LONG_TITLE)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
}

async function noOverflow(page: Page, selectors: string[] = []) {
  const r = await page.evaluate((sels) => {
    const de = document.documentElement
    const bad: string[] = []
    if (de.scrollWidth > de.clientWidth) bad.push(`html ${de.scrollWidth}>${de.clientWidth}`)
    for (const s of sels) {
      document.querySelectorAll<HTMLElement>(s).forEach((el) => { if (el.scrollWidth > el.clientWidth) bad.push(`${s} ${el.scrollWidth}>${el.clientWidth}`) })
    }
    return bad
  }, ['main', '.screen', ...selectors])
  expect(r).toEqual([])
}

test('percorso, scaffale e collezione a 390 px senza scroll orizzontale', async ({ page }) => {
  await seed(page)

  // Oggi: 6 pallini per canzone.
  await expect(page.locator('.carousel-dot').first()).toBeVisible()
  expect(await page.locator('.carousel-dot').count()).toBeGreaterThanOrEqual(6)
  await noOverflow(page) // il carosello scorre in orizzontale per progetto: si controlla la pagina

  // Studio: percorso con «Smista» e 2 da fare.
  await page.goto('/#/songs/s1')
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()
  const path = page.getByRole('list', { name: 'Percorso della canzone' })
  await expect(path.locator('li')).toHaveCount(6)
  const smista = path.getByRole('link', { name: /^Smista/ })
  await expect(smista).toHaveAttribute('aria-label', /2 da fare/)
  await noOverflow(page, ['.study-head', '.song-path'])

  // Gemini fluttuante non copre l'ultimo contenuto.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const ask = page.locator('.study-ask').getByRole('button', { name: 'Chiedi a Gemini' })
  await expect(ask).toBeVisible()
  const lastOther = page.getByRole('list', { name: 'Altre voci di questa canzone' }).getByRole('link').last()
  const last = (await lastOther.count()) > 0 ? lastOther : page.locator('.lyrics p').last()
  await last.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const a = (await ask.boundingBox())!
  const b = (await last.boundingBox())!
  const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  expect(overlap).toBe(false)

  // Smista dal percorso, poi indietro.
  await page.evaluate(() => window.scrollTo(0, 0))
  await smista.click()
  await expect(page).toHaveURL(/\/triage$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: LONG_TITLE })).toBeVisible()

  // Menu «⋯»: apre e chiude con Esc, fuoco di ritorno.
  const more = page.locator('.study-head [aria-haspopup="menu"]')
  await more.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more).toBeFocused()

  // Canzoni: griglia, Completate, guadagno, fonte del testo.
  await page.goto('/#/songs')
  await expect(page.getByRole('heading', { name: 'Completate' })).toBeVisible()
  await expect(page.getByText('+28')).toBeVisible()
  await expect(page.locator('.cover-source', { hasText: 'Podcast' })).toBeVisible()
  await noOverflow(page, ['.shelf-item'])

  // Modifica con titolo lungo: il modulo non fa traboccare.
  await page.locator('[data-song-id="s1"] .more-menu > button').click()
  await page.getByRole('menuitem', { name: 'Modifica' }).click()
  await expect(page.locator('[data-song-id="s1"] form')).toBeVisible()
  await noOverflow(page, ['.shelf-item', '[data-song-id="s1"] form'])

  // Lessico: striscia, tipo, vista per canzone.
  await page.goto('/#/lexicon')
  const seg = page.locator('.comp-seg').first()
  await expect(seg).toBeVisible()
  await noOverflow(page, ['.comp'])
  await seg.click()
  await expect(seg).toHaveAttribute('aria-pressed', 'true')
  await seg.click()
  await page.getByRole('radio', { name: 'Per canzone' }).click()
  await expect(page.getByRole('radio', { name: 'Per canzone' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  await noOverflow(page, ['.comp', '.lex-list'])
  await page.getByRole('radio', { name: 'Tutte' }).click()
  await noOverflow(page, ['.comp', '.lex-list'])
})
