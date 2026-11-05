import { expect, test } from '@playwright/test'

// Ritmo settimanale: Oggi → ripasso → fine sessione → Diario → Impostazioni → Oggi. Dati inventati, nessuna rete.
// La card R parte in Relearning (state 3, campi FSRS completi come li scrive ts-fsrs 6): un «Bene» la riporta in Review.

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

test('il ritmo conta il ripasso di oggi, il Diario lo mostra, l\'obiettivo si cambia in Impostazioni', async ({ page }) => {
  const earlier = Math.min(2, (new Date().getDay() + 6) % 7)
  const goal = 3
  const textFor = (n: number, g: number) => (n >= g ? `Obiettivo della settimana raggiunto · ${n} giorni` : n === 1 ? `1 giorno su ${g}` : `${n} giorni su ${g}`)
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
    const tx = db.transaction(['songs', 'chunks', 'cards', 'settings', 'reviews'], 'readwrite')
    tx.objectStore('settings').put({
      id: 'settings', apiKey: 'fake-key-for-e2e', model: 'gemini-flash-lite-latest', theme: 'light', level: 'B1', bandStart: 2000, bandEnd: 5000,
      desiredRetention: 0.9, newPerDay: 16, rhythmGoal: 3, timerMinutes: { study: 15, review: 30 }, persistAsked: true, installBannerDismissed: true,
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
    // Lunedì e martedì della settimana corrente, solo se prima di oggi (calendario locale).
    const today = new Date()
    const sinceMonday = (today.getDay() + 6) % 7
    for (let i = 0; i < Math.min(2, sinceMonday); i++) {
      const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday + i, 12, 0, 0)
      tx.objectStore('reviews').put({ id: `rev-${i}`, cardId: 'card-r', rating: 3, auto: false, answer: null, elapsedMs: 4000, reviewedAt: at, wasNew: false })
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  const rhythm = page.getByRole('link', { name: /^Ritmo della settimana:/ })
  if (earlier > 0) await expect(rhythm).toContainText(textFor(earlier, goal))

  await page.getByRole('link', { name: 'Inizia il giro' }).click()
  await page.getByRole('button', { name: 'Mostra significato' }).click()
  await page.getByRole('button', { name: 'Bene' }).click()
  await expect(page.getByRole('heading', { name: 'Fatto per oggi' })).toBeVisible()
  await expect(rhythm).toContainText(textFor(earlier + 1, goal))

  await page.getByRole('link', { name: 'Torna a Oggi' }).click()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  // Il giro ha raggiunto un traguardo (obiettivo o canzone): il foglio si chiude con «Bene».
  await page.getByRole('dialog').getByRole('button', { name: 'Bene' }).click()
  await expect(rhythm).toContainText(textFor(earlier + 1, goal))

  await rhythm.click()
  await expect(page.getByRole('heading', { name: 'Diario' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Ultime 12 settimane/ })).toBeVisible()
  const todayKey = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const cell = page.locator(`.cal-cell[data-day="${todayKey}"]`)
  await expect(cell).toHaveCount(1)
  await expect(cell).not.toHaveAttribute('data-level', '0')

  await page.goto('/#/settings')
  await page.getByLabel('Obiettivo settimanale').selectOption('7')
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Ritmo della settimana:/ })).toContainText(textFor(earlier + 1, 7))
})
