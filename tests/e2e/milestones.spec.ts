import { expect, test } from '@playwright/test'

// Un traguardo: tutti i versi sbloccati → foglio in Oggi → «Bene» → non ricompare → elencato nel Diario. Dati inventati, nessuna rete.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

test('«Una canzone tutta capita» si mostra una volta e resta nel Diario', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await page.evaluate(async () => {
    const DAY = 86_400_000
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('singlish')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const now = Date.now()
    const tx = db.transaction(['songs', 'chunks', 'cards', 'settings'], 'readwrite')
    tx.objectStore('settings').put({
      id: 'settings', apiKey: 'fake-key-for-e2e', model: 'gemini-flash-lite-latest', theme: 'light', level: 'B1', bandStart: 2000, bandEnd: 5000,
      desiredRetention: 0.9, newPerDay: 16, timerMinutes: { study: 15, review: 30 }, persistAsked: true, installBannerDismissed: true,
      milestonesSeen: {},
    })
    tx.objectStore('songs').put({
      id: 's1', kind: 'song', title: 'Paper Sky', artist: 'Artista inventato', spotifyUrl: null, coverUrl: null,
      lines: ['we fold the paper sky'], lineTranslations: [], status: 'studying', level: 'B1', difficultyKnownPct: 50, comprehensionBefore: 50,
      grammarPoint: null, connectedSpeech: [], addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now - DAY),
    })
    tx.objectStore('chunks').put({
      id: 'c1', songId: 's1', key: 'fold the paper', baseForm: 'fold the paper', surfaceForm: 'fold the paper', lineIndex: 0,
      contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
      meaningIt: 'piegare la carta', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
      userEdited: false, suspended: false,
    })
    const far = new Date(now + 30 * DAY)
    const last = new Date(now - 2 * DAY)
    tx.objectStore('cards').put({
      id: 'card-r', itemType: 'chunk', itemId: 'c1', kind: 'R', unlocked: 1, due: far, goodRCount: 3,
      fsrs: { due: far, stability: 30, difficulty: 5, elapsed_days: 2, scheduled_days: 32, learning_steps: 0, reps: 4, lapses: 0, state: 2, last_review: last },
    })
    tx.objectStore('cards').put({
      id: 'card-c', itemType: 'chunk', itemId: 'c1', kind: 'C', unlocked: 0, due: far, goodRCount: 0,
      fsrs: { due: far, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 },
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.reload()

  const sheet = page.getByRole('dialog', { name: 'Una canzone tutta capita' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Paper Sky')
  await sheet.getByRole('button', { name: 'Bene' }).click()
  await expect(sheet).toHaveCount(0)
  // «Bene» salva la data in modo asincrono: si aspetta che sia scritta prima di ricaricare.
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const q = indexedDB.open('singlish'); q.onsuccess = () => resolve(q.result) })
    const s = await new Promise<{ milestonesSeen?: Record<string, unknown> } | undefined>((resolve) => { const q = db.transaction('settings').objectStore('settings').get('settings'); q.onsuccess = () => resolve(q.result) })
    db.close()
    return Object.keys(s?.milestonesSeen ?? {})
  })).toContain('song-all-unlocked')

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto('/#/progress')
  const section = page.locator('.milestones')
  await expect(section.getByRole('heading', { name: 'Traguardi' })).toBeVisible()
  await expect(section).toContainText('Una canzone tutta capita')
  await expect(section).toContainText(/visto il \d{1,2} \p{L}+/u)
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  expect(fits).toBe(true)
})
