import { expect, test } from '@playwright/test'

// Ritmo della sessione: segmenti nella testa, traduzione del verso, risposta che si aggancia al buco. Dati inventati, nessuna rete.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

const noOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('i segmenti seguono i voti, la traduzione compare, la risposta esatta si aggancia', async ({ page }) => {
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
      lines: ['we fold the paper sky', 'and wait for borrowed rain'],
      lineTranslations: [{ lineIndex: 0, textIt: 'pieghiamo il cielo di carta' }, { lineIndex: 1, textIt: 'e aspettiamo la pioggia in prestito' }],
      status: 'studying', level: 'B1', difficultyKnownPct: 50, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
      addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now - 2 * DAY),
    })
    const chunk = (id: string, surface: string, lineIndex: number, meaningIt: string) => ({
      id, songId: 's1', key: surface, baseForm: surface, surfaceForm: surface, lineIndex,
      contexts: [{ songId: 's1', lineIndex }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
      meaningIt, explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
      userEdited: false, suspended: false,
    })
    tx.objectStore('chunks').put(chunk('c1', 'fold the paper', 0, 'piegare la carta'))
    tx.objectStore('chunks').put(chunk('c2', 'paper sky', 0, 'cielo di carta'))
    tx.objectStore('chunks').put(chunk('c3', 'borrowed rain', 1, 'pioggia in prestito'))
    const due = new Date(now - 60_000)
    const last = new Date(now - 5 * DAY)
    const card = (id: string, itemId: string, kind: 'R' | 'C') => ({
      id, itemType: 'chunk', itemId, kind, unlocked: 1, due, goodRCount: 0,
      fsrs: { due, stability: 4, difficulty: 5, elapsed_days: 5, scheduled_days: 4, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: last },
    })
    tx.objectStore('cards').put(card('card-r1', 'c1', 'R'))
    tx.objectStore('cards').put(card('card-r2', 'c2', 'R'))
    tx.objectStore('cards').put(card('card-c3', 'c3', 'C'))
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()

  await page.getByRole('link', { name: 'Inizia il giro' }).click()
  await expect(page.locator('.seg')).toHaveCount(3)
  expect(await noOverflow(page)).toBe(true)

  const ratedKinds: string[] = []
  let sawTranslation = false
  let sawSnap = false
  let recognised = 0
  for (let step = 0; step < 3; step++) {
    const chip = page.locator('.chip').first()
    await expect(chip).toHaveText(/RICONOSCI|COMPLETA/)
    const isC = /COMPLETA/.test((await chip.textContent()) ?? '')
    if (isC) {
      await page.getByLabel('La tua risposta').fill('borrowed rain')
      await page.getByRole('button', { name: 'Controlla' }).click()
      await expect(page.locator('.gap.snap')).toHaveText('borrowed rain')
      sawSnap = true
      expect(await noOverflow(page)).toBe(true)
      await page.getByRole('button', { name: 'Conferma' }).click()
      ratedKinds.push('full')
    } else {
      await page.getByRole('button', { name: 'Mostra significato' }).click()
      await expect(page.locator('.verse-it')).toBeVisible()
      sawTranslation = true
      expect(await noOverflow(page)).toBe(true)
      const again = recognised === 1
      await page.getByRole('button', { name: again ? 'Di nuovo' : 'Bene' }).click()
      ratedKinds.push(again ? 'empty' : 'full')
      recognised++
    }
    if (step < 2) {
      for (let i = 0; i <= step; i++) await expect(page.locator('.seg').nth(i)).toHaveClass(new RegExp(`seg-${ratedKinds[i]}`))
      expect(await noOverflow(page)).toBe(true)
    }
  }
  expect(sawTranslation && sawSnap).toBe(true)
  await expect(page.getByRole('heading', { name: 'Sessione finita' })).toBeVisible()
  expect(await noOverflow(page)).toBe(true)
})
