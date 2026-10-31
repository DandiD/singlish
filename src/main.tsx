import { render } from 'preact'
import { App } from './app'
import { db } from './db/db'
import { getSettings } from './domain/settings'
import { retryQueuedSongs } from './domain/ingest'
import { defaultDeps } from './ui/deps'
import './styles/tokens.css'
import './styles/base.css'

document.documentElement.dataset.theme = 'auto'
render(<App />, document.getElementById('app')!)
getSettings(db)
  .then((s) => {
    document.documentElement.dataset.theme = s.theme
  })
  .catch(() => {})

if (navigator.onLine) {
  const { db: d, fetch: f, sleep, now } = defaultDeps
  retryQueuedSongs({ db: d, fetch: f, sleep, now }).catch(() => {})
}
