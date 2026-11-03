import { useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useDeps } from '../deps'
import { useFailure } from '../useFailure'

/**
 * Apre il database prima di mostrare la pagina. Se non si apre (navigazione privata, dati bloccati,
 * IndexedDB assente) le query di Dexie resterebbero in attesa per sempre: qui l'errore va alla schermata di riserva.
 */
export function DbGate({ children }: { children: ComponentChildren }) {
  const { db } = useDeps()
  const fail = useFailure()
  useEffect(() => { db.open().catch(fail) }, [db])
  return <>{children}</>
}
