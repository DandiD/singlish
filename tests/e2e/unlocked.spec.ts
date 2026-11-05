import { expect, test } from '@playwright/test'

// Giro completo dei versi sbloccati: Oggi → ripasso → fine sessione → Oggi → Studio. Dati inventati, nessuna rete.
// La card R parte in Relearning (state 3, campi FSRS completi come li scrive ts-fsrs 6): un «Bene» la riporta in Review.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

test('un «Bene» sblocca il verso: fine sessione, Oggi, copertina e Studio lo dicono', async ({ page }) => {
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
    })
    tx.objectStore('songs').put({
      id: 's1', kind: 'song', title: 'Paper Sky', artist: 'Artista inventato', spotifyUrl: null, coverUrl: null,
      lines: ['we fold the paper sky', 'and wait for borrowed rain'], lineTranslations: [{ lineIndex: 0, textIt: 'pieghiamo il cielo di carta' }],
      status: 'studying', level: 'B1', difficultyKnownPct: 50, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
      addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now),
    })
    tx.objectStore('chunks').put({
      id: 'c1', songId: 's1', key: 'fold the paper', baseForm: 'fold the paper', surfaceForm: 'fold the paper', lineIndex: 0,
      contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
      meaningIt: 'piegare la carta', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
      userEdited: false, suspended: false,
    })
    const due = new Date(now - 60_000)
    tx.objectStore('cards').put({
      id: 'card-r', itemType: 'chunk', itemId: 'c1', kind: 'R', unlocked: 1, due, goodRCount: 0,
      fsrs: { due, stability: 0.61, difficulty: 7.39, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 3, lapses: 1, state: 3, last_review: new Date(now - 11 * 60_000) },
    })
    const far = new Date(now + 30 * DAY)
    tx.objectStore('cards').put({
      id: 'card-c', itemType: 'chunk', itemId: 'c1', kind: 'C', unlocked: 0, due: far, goodRCount: 0,
      fsrs: { due: far, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 },
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()

  await page.getByRole('link', { name: 'Inizia il giro' }).click()
  await page.getByRole('button', { name: 'Mostra significato' }).click()
  await page.getByRole('button', { name: 'Bene' }).click()

  await expect(page.getByRole('heading', { name: 'Fatto per oggi' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Oggi hai sbloccato 1 verso' })).toBeVisible()
  await expect(page.getByText('we fold the paper sky')).toBeVisible()

  await page.getByRole('link', { name: 'Torna a Oggi' }).click()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await expect(page.getByText('Fatto per oggi')).toBeVisible()
  await expect(page.locator('.song-carousel')).toContainText('1 di 1 verso')

  await page.goto('/#/songs/s1')
  await expect(page.getByRole('heading', { name: 'Paper Sky' })).toBeVisible()
  await expect(page.locator('.lyrics p').nth(0)).toHaveClass(/line-open/)
})
