import { expect, test } from '@playwright/test'

// Sessioni lunghe a 390 px: i segmenti stanno su una riga tutta loro, larga quanto lo schermo,
// almeno 2 px ciascuno, senza passare sotto il timer. Dati inventati, nessuna rete.

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

async function seed(page: import('@playwright/test').Page, n: number) {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await page.evaluate(async (n) => {
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
      id: 's1', kind: 'song', title: 'Lantern Street', artist: 'Artista inventato', spotifyUrl: null, coverUrl: null,
      lines: ['we carry lanterns down the quiet street'],
      lineTranslations: [{ lineIndex: 0, textIt: 'portiamo lanterne giù per la strada tranquilla' }],
      status: 'studying', level: 'B1', difficultyKnownPct: 50, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
      addedAt: new Date(now - 3 * DAY), analyzedAt: new Date(now - 3 * DAY), studyStartedAt: new Date(now - 2 * DAY),
    })
    const due = new Date(now - 60_000)
    const last = new Date(now - 5 * DAY)
    for (let i = 0; i < n; i++) {
      const surface = `lantern ${i}`
      tx.objectStore('chunks').put({
        id: `c${i}`, songId: 's1', key: surface, baseForm: surface, surfaceForm: surface, lineIndex: 0,
        contexts: [{ songId: 's1', lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
        meaningIt: `lanterna ${i}`, explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
        userEdited: false, suspended: false,
      })
      tx.objectStore('cards').put({
        id: `card-${i}`, itemType: 'chunk', itemId: `c${i}`, kind: 'R', unlocked: 1, due, goodRCount: 0,
        fsrs: { due, stability: 4, difficulty: 5, elapsed_days: 5, scheduled_days: 4, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: last },
      })
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  }, n)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
}

for (const n of [60, 120, 170]) {
  test(`${n} card: i segmenti stanno nella loro riga, ≥ 2 px, senza toccare il timer`, async ({ page }) => {
    await seed(page, n)
    await page.getByRole('link', { name: 'Inizia il giro' }).click()
    await expect(page.locator('.seg')).toHaveCount(n)
    await expect(page.getByText(`1 di ${n}`)).toBeVisible()
    await expect(page.locator('.timer-pill')).toBeVisible()
    const m = await page.evaluate(() => {
      const r = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width } }
      return {
        row: r(document.querySelector('.segs')!),
        segs: [...document.querySelectorAll('.seg')].map(r),
        pill: r(document.querySelector('.timer-pill')!),
        vw: document.documentElement.clientWidth,
      }
    })
    const last = m.segs[m.segs.length - 1]
    expect(last.right).toBeLessThanOrEqual(m.row.right + 0.5)
    expect(last.right).toBeLessThanOrEqual(m.vw)
    expect(m.segs[0].left).toBeGreaterThanOrEqual(m.row.left - 0.5)
    for (const s of m.segs) expect(s.width).toBeGreaterThanOrEqual(1.99)
    for (let i = 1; i < m.segs.length; i++) expect(m.segs[i].left).toBeGreaterThanOrEqual(m.segs[i - 1].right - 0.01)
    // il passo è 2 px finché c'è posto (60 card: 60 × 2 + 59 × 2 px < 350 px), poi si stringe
    const step = m.segs[1].left - m.segs[0].right
    if (n === 60) expect(step).toBeCloseTo(2, 1)
    else expect(step).toBeLessThan(2)
    expect(m.row.right - m.row.left).toBeGreaterThan(330)
    const overlaps = (a: typeof m.pill, b: typeof m.pill) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    expect(m.segs.filter((s) => overlaps(s, m.pill))).toEqual([])
  })
}
