import { expect, test } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })

test('manifest completo: icone any e maskable, scorciatoie, screenshot', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m).toMatchObject({ display: 'standalone', lang: 'it' })
  // Relativi al manifest, così seguono la base della build (su GitHub Pages l'app vive in /singlish/).
  for (const key of ['id', 'scope', 'start_url']) expect(m[key], key).not.toMatch(/^\/|^https?:/)
  const at = (path: string) => new URL(path, res.url())
  expect(at(m.id).pathname).toBe('/')
  expect(at(m.scope).pathname).toBe('/')
  expect(at(m.start_url).pathname + at(m.start_url).search).toBe('/?source=pwa')
  const purposes = m.icons.map((i: { purpose: string; sizes: string }) => `${i.purpose} ${i.sizes}`)
  expect(purposes).toEqual(expect.arrayContaining(['any 192x192', 'any 512x512', 'maskable 512x512']))
  expect(m.shortcuts.length).toBeGreaterThanOrEqual(2)
  expect(m.screenshots.length).toBeGreaterThanOrEqual(1)
  for (const src of [...m.icons, ...m.screenshots].map((i: { src: string }) => i.src)) {
    expect((await request.get('/' + src)).ok(), src).toBe(true)
  }
})

test('offline: dopo la prima visita l\'app si riapre senza rete, con i suoi font', async ({ page, context }) => {
  const external: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (!url.startsWith('http://localhost:4173/')) external.push(url)
    return route.fallback()
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  // Il worker è attivo solo a precache finito; la pagina ricaricata passa sotto il suo controllo.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ripasso di oggi' })).toBeVisible()
  await expect(page.getByText('Offline')).toBeVisible()
  await page.goto('/#/songs')
  await expect(page.getByRole('heading', { name: 'Canzoni' })).toBeVisible()
  expect(await page.evaluate(() => document.fonts.check('700 20px "Bricolage Grotesque"'))).toBe(true)
  expect(external).toEqual([])
  await context.setOffline(false)
})
