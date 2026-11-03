import { afterEach, expect, test } from 'vitest'
import { applyTheme } from '../../src/ui/theme'

afterEach(() => {
  document.head.innerHTML = ''
  delete document.documentElement.dataset.theme
})

function metas() {
  document.head.innerHTML =
    '<meta name="theme-color" content="#111317" media="(prefers-color-scheme: dark)">' +
    '<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">'
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
}

test('tema scelto: la barra del sistema prende il colore del tema, qualunque sia quello del sistema', () => {
  const [dark, light] = metas()
  applyTheme('light')
  expect(document.documentElement.dataset.theme).toBe('light')
  expect([dark.content, light.content]).toEqual(['#F5F6F8', '#F5F6F8'])
  applyTheme('dark')
  expect([dark.content, light.content]).toEqual(['#111317', '#111317'])
})

test('automatico: ogni meta torna al suo schema', () => {
  const [dark, light] = metas()
  applyTheme('light')
  applyTheme('auto')
  expect(document.documentElement.dataset.theme).toBe('auto')
  expect([dark.content, light.content]).toEqual(['#111317', '#F5F6F8'])
})
