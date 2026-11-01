import type { Settings } from '../db/types'

const BAR = { dark: '#111317', light: '#F5F6F8' } as const

/** Applica il tema e allinea il colore della barra di sistema (meta theme-color) al tema scelto. */
export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.dataset.theme = theme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = (meta.getAttribute('media') ?? '').includes('light') ? 'light' : 'dark'
    meta.content = BAR[theme === 'auto' ? scheme : theme]
  }
}
