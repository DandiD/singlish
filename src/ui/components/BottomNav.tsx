import { href, type Route } from '../../router'
import { Icon } from './Icon'

export function BottomNav({ route }: { route: Route }) {
  const onToday = route.name === 'today'
  const songRoutes: Route['name'][] = ['songs', 'addSong', 'analyzing', 'study', 'triage']
  const onSongs = songRoutes.includes(route.name)
  const active = onToday ? 0 : onSongs ? 1 : -1
  return (
    <nav class="bottom-nav" aria-label="Navigazione principale">
      <div class="nav-inner" style={{ '--active': active }}>
        {active >= 0 && <span class="nav-indicator" aria-hidden="true" />}
        <a href={href({ name: 'today' })} aria-current={onToday ? 'page' : undefined}>
          <Icon name="today" />
          Oggi
        </a>
        <a href={href({ name: 'songs' })} aria-current={onSongs ? 'page' : undefined}>
          <Icon name="songs" />
          Canzoni
        </a>
        <span class="disabled" aria-disabled="true">
          <Icon name="lexicon" />
          <span>Lessico <small>Presto</small></span>
        </span>
      </div>
    </nav>
  )
}
