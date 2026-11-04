import { useEffect } from 'preact/hooks'
import { href, onBackTo, useRoute, type Route } from './router'
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
import { Lexicon } from './ui/screens/Lexicon'
import { Progress } from './ui/screens/Progress'
import { FinalListen } from './ui/screens/FinalListen'
import { OfflineBadge } from './ui/components/OfflineBadge'
import { UpdateToast } from './ui/components/UpdateToast'
import { ErrorToast } from './ui/components/ErrorToast'
import { ErrorBoundary } from './ui/components/ErrorBoundary'
import { DbGate } from './ui/components/DbGate'
import { errors } from './ui/report'
import type { SwStore } from './pwa/sw-store'

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
    case 'lexicon': return 'Lessico'
    case 'progress': return 'Progressi'
    case 'finalListen': return 'Riascolto finale'
    case 'notFound': return 'Pagina non trovata'
  }
}

const NO_NAV: Route['name'][] = ['settings', 'progress', 'finalListen', 'addSong', 'analyzing', 'study', 'triage', 'session']

export function App({ swStore }: { swStore?: SwStore }) {
  const route = useRoute()
  const withNav = !NO_NAV.includes(route.name)
  const pageTitle = title(route)
  useEffect(() => {
    document.title = route.name === 'today' ? 'Singlish' : `${pageTitle} · Singlish`
  }, [pageTitle])
  return (
    <AppDepsProvider value={useDeps()}>
      <div class={withNav ? 'app with-nav' : 'app'}>
        <OfflineBadge />
        {/* Una nuova pagina riparte pulita anche se la precedente si era rotta. */}
        <ErrorBoundary key={'songId' in route ? `${route.name}:${route.songId}` : route.name}>
          <DbGate>
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
            ) : route.name === 'lexicon' ? (
              <Lexicon />
            ) : route.name === 'progress' ? (
              <Progress />
            ) : route.name === 'finalListen' ? (
              <FinalListen key={route.songId} songId={route.songId} />
            ) : (
              <main class="screen not-found">
                <h1>{title(route)}</h1>
                <p class="note">Questa pagina non esiste.</p>
                <a class="btn primary" href={href({ name: 'today' })} onClick={onBackTo({ name: 'today' })}>Torna a Oggi</a>
              </main>
            )}
          </DbGate>
        </ErrorBoundary>
        {withNav && <BottomNav route={route} />}
        {swStore && <UpdateToast store={swStore} />}
        <ErrorToast store={errors} />
      </div>
    </AppDepsProvider>
  )
}
