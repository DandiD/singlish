import { useRoute, type Route } from './router'
import { BottomNav } from './ui/components/BottomNav'
import { AppDepsProvider, useDeps } from './ui/deps'
import { Settings } from './ui/screens/Settings'
import { Songs } from './ui/screens/Songs'
import { AddSong } from './ui/screens/AddSong'
import { Analyzing } from './ui/screens/Analyzing'
import { Study } from './ui/screens/Study'
import { Triage } from './ui/screens/Triage'
import { Today } from './ui/screens/Today'
import { Session } from './ui/screens/Session'

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
        ) : route.name === 'songs' ? (
          <Songs />
        ) : route.name === 'addSong' ? (
          <AddSong />
        ) : route.name === 'analyzing' ? (
          <Analyzing key={route.songId} songId={route.songId} />
        ) : route.name === 'study' ? (
          <Study key={route.songId} songId={route.songId} itemId={route.itemId} />
        ) : route.name === 'triage' ? (
          <Triage key={route.songId} songId={route.songId} />
        ) : route.name === 'today' ? (
          <Today />
        ) : route.name === 'session' ? (
          <Session />
        ) : (
          <main class="screen">
            <h1>{title(route)}</h1>
            <p>In arrivo.</p>
          </main>
        )}
        {route.name !== 'settings' && route.name !== 'addSong' && route.name !== 'analyzing' && route.name !== 'study' && route.name !== 'triage' && route.name !== 'session' && <BottomNav route={route} />}
      </div>
    </AppDepsProvider>
  )
}
