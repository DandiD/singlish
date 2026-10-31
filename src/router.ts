import { useEffect, useState } from 'preact/hooks'

export type Route =
  | { name: 'today' }
  | { name: 'songs' }
  | { name: 'addSong' }
  | { name: 'analyzing'; songId: string }
  | { name: 'study'; songId: string; itemId?: string }
  | { name: 'triage'; songId: string }
  | { name: 'session' }
  | { name: 'settings' }
  | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c] = parts

  if (parts.length === 0) return { name: 'today' }
  if (a === 'session' && parts.length === 1) return { name: 'session' }
  if (a === 'settings' && parts.length === 1) return { name: 'settings' }
  if (a === 'songs') {
    if (parts.length === 1) return { name: 'songs' }
    if (b === 'new' && parts.length === 2) return { name: 'addSong' }
    if (parts.length === 2) {
      const itemId = new URLSearchParams(query).get('item')
      return itemId ? { name: 'study', songId: b, itemId } : { name: 'study', songId: b }
    }
    if (parts.length === 3 && c === 'analyzing') return { name: 'analyzing', songId: b }
    if (parts.length === 3 && c === 'triage') return { name: 'triage', songId: b }
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
    case 'analyzing':
      return `#/songs/${encodeURIComponent(route.songId)}/analyzing`
    case 'study': {
      const base = `#/songs/${encodeURIComponent(route.songId)}`
      return route.itemId ? `${base}?item=${encodeURIComponent(route.itemId)}` : base
    }
    case 'triage':
      return `#/songs/${encodeURIComponent(route.songId)}/triage`
    case 'session':
      return '#/session'
    case 'settings':
      return '#/settings'
    case 'notFound':
      return '#/404'
  }
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseRoute(hash)
}
