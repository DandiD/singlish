import { actionMessage } from './errors'

/**
 * Avviso per le azioni non riuscite. Le schermate chiamano `report(e)`; gli errori che sfuggono
 * (promesse rifiutate senza gestione) arrivano qui da `listen`. Il testo è sempre quello per l'utente.
 */
export function createErrorStore() {
  let message: string | null = null
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())
  return {
    get: () => message,
    subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
    report(e: unknown) { message = actionMessage(e); emit() },
    dismiss() { message = null; emit() },
    listen(win: Window) {
      const onRejection = (ev: Event) => {
        ev.preventDefault()
        this.report((ev as PromiseRejectionEvent).reason)
      }
      win.addEventListener('unhandledrejection', onRejection)
      return () => win.removeEventListener('unhandledrejection', onRejection)
    },
  }
}

export type ErrorStore = ReturnType<typeof createErrorStore>

/** L'avviso dell'app: le schermate segnalano qui gli errori delle azioni. */
export const errors = createErrorStore()
export const reportError = (e: unknown) => errors.report(e)
