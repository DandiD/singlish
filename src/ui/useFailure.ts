import { useState } from 'preact/hooks'

/**
 * Un caricamento fallito dentro un effetto non lascia la pagina in attesa per sempre:
 * l'errore viene rilanciato nel disegno e lo raccoglie la schermata di riserva (ErrorBoundary).
 */
export function useFailure(): (e: unknown) => void {
  const [failure, setFailure] = useState<{ e: unknown } | null>(null)
  if (failure) throw failure.e
  return (e: unknown) => setFailure({ e })
}
