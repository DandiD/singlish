import { render } from 'preact'
import { App } from './app'
import './styles/tokens.css'
import './styles/base.css'

document.documentElement.dataset.theme = 'auto'
render(<App />, document.getElementById('app')!)
