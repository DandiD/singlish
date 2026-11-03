import { Component, type ComponentChildren } from 'preact'
import { href } from '../../router'
import { storageProblem } from '../errors'

type State = { error: unknown }

/** Se una schermata si rompe mentre si disegna, al posto del bianco c'è una pagina che spiega e offre una via d'uscita. */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('unknown') }
  }

  render() {
    if (!this.state.error) return this.props.children
    const storage = storageProblem(this.state.error)
    const title = storage?.title ?? 'Questa pagina si è bloccata'
    const text = storage?.text ?? 'Un errore inatteso l\'ha interrotta. I tuoi dati sono al sicuro.'
    return (
      <main class="screen not-found">
        <h1>{title}</h1>
        <p class="note">{text}</p>
        <button type="button" class="btn primary" onClick={() => window.location.reload()}>Ricarica</button>
        <a class="btn outline" href={href({ name: 'today' })} onClick={() => this.setState({ error: null })}>Torna a Oggi</a>
      </main>
    )
  }
}
