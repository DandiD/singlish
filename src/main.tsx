import { render } from 'preact'
import { App } from './app'
import { db } from './db/db'
import { getSettings } from './domain/settings'
import './styles/tokens.css'
import './styles/base.css'

document.documentElement.dataset.theme = 'auto'
render(<App />, document.getElementById('app')!)
getSettings(db)
  .then((s) => {
    document.documentElement.dataset.theme = s.theme
  })
  .catch(() => {})
