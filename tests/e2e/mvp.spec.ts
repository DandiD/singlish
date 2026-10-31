import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const analysis = readFileSync('tests/fixtures/analysis.json', 'utf8')
const lyrics = readFileSync('tests/fixtures/lyrics.txt', 'utf8').trim()

/** Lista di frequenza finta: flicker e wander nella fascia B1 (2000–5000), shadow fuori. */
function fakeFreq(): string[] {
  const list = Array.from({ length: 6000 }, (_, i) => `filler${String(i + 1).padStart(4, '0')}`)
  list[2999] = 'flicker'
  list[3499] = 'wander'
  list[5499] = 'shadow'
  return list
}

async function mockNetwork(page: Page) {
  const external: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost:4173/')) return route.fallback()
    if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) external.push(url)
    return route.abort()
  })
  await page.route('**/freq.json', (r) => r.fulfill({ json: fakeFreq() }))
  await page.route('https://generativelanguage.googleapis.com/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: analysis }] } }] }),
    }),
  )
  await page.route('https://open.spotify.com/oembed**', (r) => r.fulfill({ status: 500, body: '' }))
  return external
}

const newCount = async (page: Page) =>
  Number(await page.locator('.stat', { hasText: 'nuove' }).locator('.stat-num').innerText())

test('percorso completo: chiave, canzone, analisi, triage, studio, sessione, persistenza', async ({ page }) => {
  const external = await mockNetwork(page)

  await page.goto('/#/settings')
  await page.getByLabel('Chiave API').fill('fake-key-for-e2e')
  await page.getByRole('button', { name: 'Prova' }).click()
  await expect(page.getByText('Chiave valida')).toBeVisible()

  await page.goto('/#/songs')
  await page.getByRole('button', { name: /Aggiungi/ }).click()
  await page.getByLabel('Link Spotify').fill('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')
  await page.getByLabel('Titolo').click() // blur del link: oEmbed 500, titolo resta vuoto
  await page.getByLabel('Titolo').fill('Canzone di prova')
  await page.getByLabel('Artista').fill('Artista inventato')
  await page.getByLabel('Testo').fill(lyrics)
  await page.getByLabel('Quanto hai capito?').fill('50')
  await page.getByRole('button', { name: 'Analizza con Gemini' }).click()

  await page.getByRole('button', { name: 'Studiala ora' }).click()
  await expect(page.getByRole('heading', { name: 'Smista parole' })).toBeVisible()
  await expect(page.locator('.triage-list li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Conferma' }).click()

  await expect(page.getByRole('heading', { name: 'Canzone di prova' })).toBeVisible()
  expect(await page.locator('.hl').count()).toBeGreaterThanOrEqual(3)

  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  const before = await newCount(page)
  expect(before).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'Inizia sessione' }).click()
  await page.getByRole('button', { name: 'Mostra significato' }).click()
  await page.getByRole('button', { name: 'Bene' }).click()

  await page.goto('/#/')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await expect.poll(() => newCount(page)).toBe(before - 1)

  // Nulla deve uscire verso la rete, a parte le richieste intercettate (Spotify oEmbed).
  const unexpected = external.filter((u) => !u.startsWith('https://open.spotify.com/oembed'))
  expect(unexpected).toEqual([])
})
