import { render } from 'preact'
import { App } from './app'
import { db } from './db/db'
import { registerSW } from 'virtual:pwa-register'
import { getSettings, saveSettings, seedApiKey } from './domain/settings'
import { repairHomes } from './domain/ingest'
import { retryQueuedSongs } from './domain/ingest'
import { defaultDeps } from './ui/deps'
import { createSwStore } from './pwa/sw-store'
import { applyTheme } from './ui/theme'
import { errors } from './ui/report'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'

const swStore = createSwStore((hooks) => registerSW({ immediate: true, ...hooks }))

errors.listen(window)
applyTheme('auto')
render(<App swStore={swStore} />, document.getElementById('app')!)
// La chiave da .env.local solo in sviluppo: Vite copierebbe le variabili VITE_* nel codice costruito.
seedApiKey(db, import.meta.env.DEV ? import.meta.env.VITE_GEMINI_API_KEY : undefined).catch(() => {})
// Dati salvati prima della regola «canzone e riga seguono i versi»: si sistemano una volta all'apertura.
repairHomes(db).catch(() => {})
getSettings(db)
  .then((s) => applyTheme(s.theme))
  .catch(() => {})

if (navigator.onLine) {
  const { db: d, fetch: f, sleep, now } = defaultDeps
  retryQueuedSongs({ db: d, fetch: f, sleep, now }).catch(() => {})
}

getSettings(db)
  .then(async (s) => {
    if (s.persistAsked) return
    await navigator.storage?.persist?.()
    await saveSettings(db, { persistAsked: true })
  })
  .catch(() => {})
