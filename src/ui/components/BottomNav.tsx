import { href, type Route } from '../../router'

export function BottomNav({ route }: { route: Route }) {
  const onToday = route.name === 'today'
  const onSongs = ['songs', 'addSong', 'analyzing', 'study', 'triage'].includes(route.name)
  return (
    <nav class="bottom-nav" aria-label="Navigazione principale">
      <a href={href({ name: 'today' })} aria-current={onToday ? 'page' : undefined}>Oggi</a>
      <a href={href({ name: 'songs' })} aria-current={onSongs ? 'page' : undefined}>Canzoni</a>
      <span class="disabled" aria-disabled="true">
        Lessico
        <small>Presto</small>
      </span>
    </nav>
  )
}
