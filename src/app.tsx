import { useRoute, type Route } from './router'
import { BottomNav } from './ui/components/BottomNav'
import { AppDepsProvider, useDeps } from './ui/deps'
import { Settings } from './ui/screens/Settings'

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
    <AppDepsProvider value={useDeps()}>
      <div class="app">
        {route.name === 'settings' ? (
          <Settings />
        ) : (
          <main class="screen">
            <h1>{title(route)}</h1>
            <p>In arrivo.</p>
          </main>
        )}
        {route.name !== 'settings' && <BottomNav route={route} />}
      </div>
    </AppDepsProvider>
  )
}
