import { expect, test, type Page } from '@playwright/test'

// Layout di Oggi a 390 × 844: l'azione principale si vede al caricamento, sopra la navigazione in basso,
// la pagina non scorre in orizzontale e un titolo lunghissimo resta dentro la sua copertina. Dati inventati.

const DAY = 86_400_000
const LONG_TITLE = 'L'.repeat(120)

type Rows = { songs: object[]; chunks: object[]; words: object[]; cards: object[] }

function song(id: string, title: string, addedAt: Date) {
  return {
    id, kind: 'song', title, artist: 'Artista inventato', spotifyUrl: null, coverUrl: null,
    lines: ['we fold the paper sky', 'and wait for borrowed rain'], status: 'studying', level: 'B1',
    difficultyKnownPct: 50, comprehensionBefore: 50, grammarPoint: null, connectedSpeech: [],
    addedAt, analyzedAt: addedAt, studyStartedAt: new Date(Date.now() - DAY),
  }
}

/** Una voce in scadenza da ieri nella canzone, con la sua card di riconoscimento. */
function dueChunk(rows: Rows, songId: string, id: string) {
  const yesterday = new Date(Date.now() - DAY)
  rows.chunks.push({
    id, songId, key: id, baseForm: `phrase ${id}`, surfaceForm: `phrase ${id}`, lineIndex: 0,
    contexts: [{ songId, lineIndex: 0 }], type: 'collocation', cefr: 'B1', register: 'usable', topic: '',
    meaningIt: 'significato', explanationIt: '', extraExampleEn: '', productionPromptIt: '', pronunciationNoteIt: '',
    userEdited: false, suspended: false,
  })
  rows.cards.push({
    id: `card-${id}`, itemType: 'chunk', itemId: id, kind: 'R', unlocked: 1, due: yesterday, goodRCount: 0,
    fsrs: { due: yesterday, stability: 5, difficulty: 5, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 3, lapses: 0, state: 2, last_review: yesterday },
  })
}

function pendingWord(rows: Rows, songId: string, id: string) {
  rows.words.push({
    id, lemma: id, surfaceForm: id, pos: 'noun', freqRank: 3000, songId, lineIndex: 1, contexts: [{ songId, lineIndex: 1 }],
    cefr: 'B1', register: 'usable', topic: '', meaningIt: 'significato', explanationIt: '', extraExampleEn: '',
    triage: 'pending', userEdited: false, suspended: false,
  })
}

/** Due canzoni aperte (la seconda con un titolo lunghissimo senza spazi); `todo` mette 6 card in coda, `triage` solo parole da smistare. */
function scenario(kind: 'todo' | 'triage'): Rows {
  const rows: Rows = { songs: [], chunks: [], words: [], cards: [] }
  rows.songs.push(song('s1', 'Paper Sky', new Date(2026, 0, 1)), song('s2', LONG_TITLE, new Date(2026, 0, 2)))
  if (kind === 'todo') for (let i = 0; i < 6; i++) dueChunk(rows, 's1', `c${i}`)
  else for (const w of ['gull', 'tide', 'lantern']) pendingWord(rows, 's1', w)
  return rows
}

async function seed(page: Page, rows: Rows, { installBanner = false } = {}) {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await page.evaluate(async ({ rows, installBanner }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('singlish')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction(['songs', 'chunks', 'words', 'cards', 'settings'], 'readwrite')
    for (const [store, list] of Object.entries(rows)) for (const row of list) tx.objectStore(store).put(row)
    tx.objectStore('settings').put({
      id: 'settings', apiKey: '', model: 'gemini-flash-lite-latest', theme: 'light', level: 'B1', bandStart: 2000, bandEnd: 5000,
      desiredRetention: 0.9, newPerDay: 16, timerMinutes: { study: 15, review: 30 }, persistAsked: true, installBannerDismissed: !installBanner,
    })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  }, { rows, installBanner })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  if (installBanner) {
    // Il browser propone l'installazione: lo script di index.html tiene l'evento e Oggi mostra il banner.
    await page.evaluate(() => dispatchEvent(new Event('beforeinstallprompt')))
    await expect(page.getByRole('region', { name: 'Installa Singlish' })).toBeVisible()
  }
}

async function expectLayout(page: Page, ctaName: string | RegExp) {
  const cta = page.getByRole('link', { name: ctaName })
  await expect(cta).toBeVisible()
  await expect(page.locator('.song-carousel')).toBeVisible()
  const m = await page.evaluate(() => {
    const cta = document.querySelector('.today-cta')!.getBoundingClientRect()
    const nav = document.querySelector('.bottom-nav')!.getBoundingClientRect()
    const items = [...document.querySelectorAll('.song-carousel > li')].map((li) => {
      const box = li.getBoundingClientRect()
      const el = li.querySelector('.song-carousel-title')!
      const title = el.getBoundingClientRect()
      // Il testo va a capo dentro il titolo (niente parte tagliata a destra) e il titolo sta dentro la copertina.
      return { inside: { left: title.left - box.left, right: box.right - title.right, top: title.top - box.top, bottom: box.bottom - title.bottom }, textOverflow: el.scrollWidth - el.clientWidth }
    })
    return { scrollY, innerHeight, innerWidth, scrollWidth: document.documentElement.scrollWidth, ctaTop: cta.top, ctaBottom: cta.bottom, navTop: nav.top, items }
  })
  expect(m.scrollY).toBe(0)
  // Nella metà bassa dello schermo e sopra la navigazione, senza scorrere.
  expect(m.ctaTop).toBeGreaterThanOrEqual(m.innerHeight / 2)
  expect(m.ctaBottom).toBeLessThanOrEqual(m.navTop)
  expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth)
  expect(m.items.length).toBeGreaterThanOrEqual(2)
  for (const item of m.items) {
    for (const side of Object.values(item.inside)) expect(side).toBeGreaterThanOrEqual(-0.5)
    expect(item.textOverflow).toBeLessThanOrEqual(1) // arrotondamento al pixel
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => (route.request().url().startsWith('http://localhost:4173/') ? route.fallback() : route.abort()))
})

test('card in coda: «Inizia il giro» si vede al caricamento, sopra la navigazione', async ({ page }) => {
  await seed(page, scenario('todo'))
  await expectLayout(page, 'Inizia il giro')
})

test('coda vuota con parole da smistare: l\'azione si vede al caricamento, sopra la navigazione', async ({ page }) => {
  await seed(page, scenario('triage'))
  await expectLayout(page, 'Smista le parole di «Paper Sky»')
})

test('con il banner d\'installazione l\'azione resta visibile sopra la navigazione', async ({ page }) => {
  await seed(page, scenario('todo'), { installBanner: true })
  await expectLayout(page, 'Inizia il giro')
})
