/** Testo tecnico di un errore, per i «Dettagli tecnici» (mai nel messaggio per l'utente). */
export function errorDetails(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(0, 6).join('\n')}` : ''}`
  try { return String(e) } catch { return 'unknown' }
}

/**
 * Se un errore fa sparire l'intera app (fuori dalle schermate, dove ErrorBoundary non arriva), il contenitore
 * resta vuoto e si vede solo lo sfondo: qui si mostra una pagina che lo dice. Scritta a mano, senza Preact.
 */
export function installCrashFallback(win: Window, root: HTMLElement): () => void {
  const onError = (ev: ErrorEvent) => {
    if (root.childElementCount > 0) return
    const doc = root.ownerDocument
    const main = doc.createElement('main')
    main.className = 'screen not-found'
    const h1 = doc.createElement('h1')
    h1.textContent = 'L\'app si è bloccata'
    const p = doc.createElement('p')
    p.className = 'note'
    p.textContent = 'Un errore inatteso l\'ha interrotta. I tuoi dati sono al sicuro.'
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'btn primary'
    btn.textContent = 'Ricarica'
    btn.addEventListener('click', () => win.location.reload())
    const details = doc.createElement('details')
    details.className = 'error-details'
    const summary = doc.createElement('summary')
    summary.textContent = 'Dettagli tecnici'
    const pre = doc.createElement('pre')
    pre.textContent = errorDetails(ev.error ?? ev.message)
    details.append(summary, pre)
    main.append(h1, p, btn, details)
    root.appendChild(main)
  }
  win.addEventListener('error', onError)
  return () => win.removeEventListener('error', onError)
}
