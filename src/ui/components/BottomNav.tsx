import { href, type Route } from '../../router'
import { Icon } from './Icon'

/** La scheda già aperta, toccata di nuovo, riporta la pagina in cima invece di non fare nulla. */
function toTop(e: MouseEvent) {
  const a = e.currentTarget as HTMLAnchorElement
  if ((window.location.hash || '#/') !== a.getAttribute('href')) return
  e.preventDefault()
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}

export function BottomNav({ route }: { route: Route }) {
  const onToday = route.name === 'today'
  const songRoutes: Route['name'][] = ['songs', 'addSong', 'analyzing', 'study', 'triage']
  const onSongs = songRoutes.includes(route.name)
  const onLexicon = route.name === 'lexicon'
  const active = onToday ? 0 : onSongs ? 1 : onLexicon ? 2 : -1
  return (
    <nav class="bottom-nav" aria-label="Navigazione principale">
      <div class="nav-inner" style={{ '--active': active }}>
        {active >= 0 && <span class="nav-indicator" aria-hidden="true" />}
        <a href={href({ name: 'today' })} onClick={toTop} aria-current={onToday ? 'page' : undefined}>
          <Icon name="today" />
          Oggi
        </a>
        <a href={href({ name: 'songs' })} onClick={toTop} aria-current={onSongs ? 'page' : undefined}>
          <Icon name="songs" />
          Canzoni
        </a>
        <a href={href({ name: 'lexicon' })} onClick={toTop} aria-current={onLexicon ? 'page' : undefined}>
          <Icon name="lexicon" />
          Lessico
        </a>
      </div>
    </nav>
  )
}
