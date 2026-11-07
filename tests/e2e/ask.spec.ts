import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const analysis = readFileSync('tests/fixtures/analysis.json', 'utf8')
const lyrics = readFileSync('tests/fixtures/lyrics.txt', 'utf8').trim()

const fields = { cefr: 'B2', register: 'usable', topic: 'relationships', explanation_it: 'Smettere di tenere qualcuno con sé.', extra_example_en: 'I had to let her go.', production_prompt_it: 'Dì che lasci andare una persona.' }
const asked = {
  answers: [
    {
      id: 'w1', translation_it: 'Forse ho sbagliato a lasciarti andare',
      item: { item_type: 'chunk', surface_form: 'let you go', widened: false, type: 'fixed_phrase', base_form: 'let someone go', meaning_it: 'lasciare andare qualcuno', ...fields },
      verse: null,
    },
    {
      id: 'v1', translation_it: 'Domani non mi volterò affatto indietro',
      item: null,
      verse: { sense_it: 'Promette a sé stesso di non tornare sui propri passi.', grammar_it: null, culture_it: 'Frase di addio tipica delle ballate.', proposals: [] },
    },
  ],
}

/** Lista di frequenza finta: flicker e wander nella fascia B1, shadow fuori. */
function fakeFreq(): string[] {
  const list = Array.from({ length: 6000 }, (_, i) => `filler${String(i + 1).padStart(4, '0')}`)
  list[2999] = 'flicker'
  list[3499] = 'wander'
  list[5499] = 'shadow'
  return list
}

async function mockNetwork(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('http://localhost:4173/')) return route.fallback()
    return route.abort()
  })
  await page.route('**/freq.json', (r) => r.fulfill({ json: fakeFreq() }))
  await page.route('https://generativelanguage.googleapis.com/**', (r) => {
    const body = r.request().postData() ?? ''
    const text = body.includes('Richieste:') ? JSON.stringify(asked) : analysis
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) })
  })
  await page.route('https://open.spotify.com/oembed**', (r) => r.fulfill({ status: 500, body: '' }))
}

test('Chiedi a Gemini: espressione unita e verso intero entrano nello Studio', async ({ page }) => {
  await mockNetwork(page)
  await page.goto('/#/settings')
  await page.getByLabel('Chiave API').fill('fake-key-for-e2e')
  await page.getByRole('button', { name: 'Prova' }).click()
  await expect(page.getByText('Chiave valida')).toBeVisible()

  await page.goto('/#/songs')
  await page.getByRole('button', { name: /Aggiungi/ }).click()
  await page.getByLabel('Titolo').fill('Canzone di prova')
  await page.getByLabel('Testo').fill(lyrics)
  await page.getByLabel('Quanto hai capito?').fill('50')
  await page.getByRole('button', { name: 'Analizza con Gemini' }).click()
  await page.getByRole('button', { name: 'Studiala ora' }).click()
  await page.getByRole('button', { name: 'Conferma' }).click()
  await expect(page.getByRole('heading', { name: 'Canzone di prova' })).toBeVisible()

  await page.getByRole('button', { name: 'Chiedi a Gemini' }).click()
  const line = page.locator('.lyrics p', { hasText: 'Maybe I was wrong' })
  await line.getByRole('button', { name: 'let', exact: true }).click()
  await line.getByRole('button', { name: 'you', exact: true }).click()
  await line.getByRole('button', { name: 'go', exact: true }).click()
  await line.getByRole('button', { name: /Unisci «let» e «you»/ }).click()
  await line.getByRole('button', { name: /Unisci «you» e «go»/ }).click()
  await page.getByRole('button', { name: 'Verso intero 9' }).click()
  await expect(page.getByRole('region', { name: 'Da chiedere a Gemini' })).toContainText('1 verso · 1 voce')
  await page.getByRole('region', { name: 'Da chiedere a Gemini' }).getByRole('button', { name: 'Chiedi a Gemini' }).click()

  const sheet = page.getByRole('dialog', { name: 'Risposte di Gemini' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Aggiungi 2 card al ripasso' }).click()
  await expect(sheet).toBeHidden()

  await expect(page.getByRole('link', { name: 'Note sul verso 9' })).toBeVisible()
  await expect(page.locator('.lyrics .hl', { hasText: 'let you go' })).toBeVisible()
})
