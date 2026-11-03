import { useLiveQuery } from 'dexie-react-hooks'

/**
 * useLiveQuery che non nasconde gli errori: se la query fallisce (database che non si apre,
 * dati illeggibili) l'errore arriva alla schermata di riserva invece di lasciare la pagina in attesa.
 */
export function useLive<T>(querier: () => Promise<T> | T, deps: unknown[]): T | undefined {
  const r = useLiveQuery(async (): Promise<{ v: T } | { e: unknown }> => {
    try {
      return { v: await querier() }
    } catch (e) {
      return { e }
    }
  }, deps)
  if (r && 'e' in r) throw r.e
  return r?.v
}
