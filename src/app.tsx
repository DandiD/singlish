import { useRoute, type Route } from './router'
import { BottomNav } from './ui/components/BottomNav'

function title(route: Route): string {
  switch (route.name) {
    case 'today': return 'Oggi'
    case 'songs': return 'Canzoni'
    case 'addSong': return 'Aggiungi canzone'
    case 'analyzing': return 'Analisi in corso'
    case 'study': return 'Studio canzone'
    case 'triage': return 'Smista parole'
    case 'session': return 'Ripasso'
    case 'settings': return 'Impostazioni'
    case 'notFound': return 'Pagina non trovata'
  }
}

export function App() {
  const route = useRoute()
  return (
    <div class="app">
      <main class="screen">
        <h1>{title(route)}</h1>
        <p>In arrivo.</p>
      </main>
      <BottomNav route={route} />
    </div>
  )
}
