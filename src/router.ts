import { useEffect, useRef, useState } from 'preact/hooks'
import { createNavHistory, type NavHistory } from './nav-history'

export type Route =
  | { name: 'today' }
  | { name: 'songs' }
  | { name: 'addSong' }
  | { name: 'addText' }
  | { name: 'analyzing'; songId: string }
  | { name: 'study'; songId: string; itemId?: string }
  | { name: 'triage'; songId: string }
  | { name: 'finalListen'; songId: string }
  | { name: 'session' }
  | { name: 'settings' }
  | { name: 'lexicon' }
  | { name: 'progress' }
  | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  let parts: string[]
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { name: 'notFound' }
  }
  const [a, b, c] = parts

  if (parts.length === 0) return { name: 'today' }
  if (a === 'session' && parts.length === 1) return { name: 'session' }
  if (a === 'settings' && parts.length === 1) return { name: 'settings' }
  if (a === 'lexicon' && parts.length === 1) return { name: 'lexicon' }
  if (a === 'progress' && parts.length === 1) return { name: 'progress' }
  if (a === 'songs') {
    if (parts.length === 1) return { name: 'songs' }
    if (b === 'new' && parts.length === 2) return { name: 'addSong' }
    if (b === 'new-text' && parts.length === 2) return { name: 'addText' }
    if (parts.length === 2) {
      const itemId = new URLSearchParams(query).get('item')
      return itemId ? { name: 'study', songId: b, itemId } : { name: 'study', songId: b }
    }
    if (parts.length === 3 && c === 'analyzing') return { name: 'analyzing', songId: b }
    if (parts.length === 3 && c === 'triage') return { name: 'triage', songId: b }
    if (parts.length === 3 && c === 'final') return { name: 'finalListen', songId: b }
  }
  return { name: 'notFound' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'today':
      return '#/'
    case 'songs':
      return '#/songs'
    case 'addSong':
      return '#/songs/new'
    case 'addText':
      return '#/songs/new-text'
    case 'analyzing':
      return `#/songs/${encodeURIComponent(route.songId)}/analyzing`
    case 'study': {
      const base = `#/songs/${encodeURIComponent(route.songId)}`
      return route.itemId ? `${base}?item=${encodeURIComponent(route.itemId)}` : base
    }
    case 'triage':
      return `#/songs/${encodeURIComponent(route.songId)}/triage`
    case 'finalListen':
      return `#/songs/${encodeURIComponent(route.songId)}/final`
    case 'session':
      return '#/session'
    case 'settings':
      return '#/settings'
    case 'lexicon':
      return '#/lexicon'
    case 'progress':
      return '#/progress'
    case 'notFound':
      return '#/404'
  }
}

export type NavDirection = 'forward' | 'back' | 'fade' | 'none'

const DEPTH: Record<Route['name'], number> = {
  today: 0, songs: 0, lexicon: 0, notFound: 0,
  settings: 1, progress: 1, addSong: 1, addText: 1, study: 1, session: 1,
  analyzing: 2, triage: 2, finalListen: 2,
}

/** Come animare il passaggio fra due route: in profondità avanti/indietro, fra schede in dissolvenza. */
export function navDirection(from: Route, to: Route): NavDirection {
  if (href(from) === href(to)) return 'none'
  // Aprire o chiudere la scheda di un elemento: il foglio dal basso si anima da solo.
  if (from.name === 'study' && to.name === 'study' && from.songId === to.songId) return 'none'
  const d = DEPTH[to.name] - DEPTH[from.name]
  return d > 0 ? 'forward' : d < 0 ? 'back' : 'fade'
}

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void>; ready: Promise<void> }
}

/**
 * Aspetta che la nuova schermata abbia i dati (niente main aria-busy), al massimo `maxMs`.
 * Con setTimeout e non requestAnimationFrame: durante la transizione il disegno è sospeso.
 */
function settled(maxMs = 250): Promise<void> {
  const start = performance.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (!document.querySelector('main[aria-busy="true"]') || performance.now() - start > maxMs) resolve()
      else setTimeout(tick, 16)
    }
    setTimeout(tick, 0)
  })
}

let nav: NavHistory | null = null
function getNav(): NavHistory {
  if (!nav) {
    let storage: Storage
    try { storage = window.sessionStorage } catch { storage = memory() }
    nav = createNavHistory(window, storage)
  }
  return nav
}
function memory(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, get length() { return m.size },
  }
}

/** Torna alla pagina precedente dell'app (come il tasto Indietro); senza, va a `fallback`. */
export function goBack(fallback: Route): void { getNav().back(href(fallback)) }
/** Torna a `target` ripercorrendo la cronologia se è la voce precedente, altrimenti la sostituisce. */
export function goBackTo(target: Route): void { getNav().backTo(href(target)) }
/** Va a `target` al posto della pagina corrente: il ritorno non ci ripassa. */
export function goReplace(target: Route): void { getNav().replace(href(target)) }

/** onClick per i link «Indietro»: l'href resta come riserva (apertura in nuova scheda, link diretti). */
export function onBack(fallback: Route) {
  return (e: MouseEvent) => { if (plainClick(e)) goBack(fallback) }
}
/** onClick per i link che chiudono un percorso tornando a `target` (per esempio «Torna a Oggi»). */
export function onBackTo(target: Route) {
  return (e: MouseEvent) => { if (plainClick(e)) goBackTo(target) }
}
function plainClick(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false
  e.preventDefault()
  return true
}

/** Riporta lo scroll a `y` quando la pagina è abbastanza alta (i dati arrivano dopo). */
function restoreScroll(y: number) {
  window.scrollTo(0, y)
  if (y <= 0) return
  const start = performance.now()
  const retry = () => {
    if (Math.abs(window.scrollY - y) < 2 || performance.now() - start > 1000) return
    window.scrollTo(0, y)
    setTimeout(retry, 50)
  }
  setTimeout(retry, 50)
}

/** Il fuoco va sul titolo della nuova pagina, a meno che la pagina non l'abbia già messo altrove. */
function focusHeading() {
  const main = document.querySelector('main')
  const active = document.activeElement
  if (!main || (active && active !== document.body && main.contains(active))) return
  const target = main.querySelector<HTMLElement>('h1') ?? main
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  const current = useRef(hash)
  useEffect(() => {
    const appHistory = getNav()
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    let initial = true
    const onChange = () => {
      const next = window.location.hash
      const first = initial
      initial = false
      if (!first) appHistory.remember(window.scrollY)
      const step = appHistory.sync()
      const dir = first ? 'none' : navDirection(parseRoute(current.current), parseRoute(next))
      current.current = next
      const doc = document as ViewTransitionDoc
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      // La nuova schermata parte dall'alto, o dal punto in cui la si era lasciata se ci si torna.
      const y = step.kind === 'pop' ? step.y : 0
      const show = () => {
        setHash(next)
        if (dir !== 'none') window.scrollTo(0, 0)
      }
      const after = () => {
        if (dir === 'none') return
        if (y > 0) restoreScroll(y)
        focusHeading()
      }
      if (dir === 'none' || !doc.startViewTransition || reduce) {
        show()
        if (dir !== 'none') void settled(1000).then(after)
        return
      }
      const root = document.documentElement
      root.dataset.nav = dir
      const vt = doc.startViewTransition(async () => {
        show()
        await settled()
        if (y > 0) window.scrollTo(0, y)
      })
      // Una transizione interrotta (un'altra navigazione, la finestra che cambia) non è un errore.
      vt.ready.catch(() => {})
      vt.finished.catch(() => {}).finally(() => {
        if (root.dataset.nav === dir) delete root.dataset.nav
        if (current.current === next) after()
      })
    }
    onChange()
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseRoute(hash)
}
