import { useEffect, useState } from 'preact/hooks'
import type { SwStatus, SwStore } from '../../pwa/sw-store'

const FAIL_AFTER_MS = 8000
const AUTO_HIDE_MS = 3000

function useStatus(store: SwStore): SwStatus {
  const [status, setStatus] = useState(store.get().status)
  useEffect(() => store.subscribe(() => setStatus(store.get().status)), [store])
  return status
}

/** Pillola in basso: nuova versione, aggiornamento in corso o fallito, pronta offline. */
export function UpdateToast({ store }: { store: SwStore }) {
  const status = useStatus(store)

  useEffect(() => {
    if (status === 'updating') {
      const t = setTimeout(() => store.fail(), FAIL_AFTER_MS)
      return () => clearTimeout(t)
    }
    if (status === 'offlineReady' || status === 'updated') {
      const t = setTimeout(() => store.dismiss(), AUTO_HIDE_MS)
      return () => clearTimeout(t)
    }
  }, [status, store])

  if (status === 'idle') return null
  const update = () => void store.applyUpdate()

  return (
    <div class="toast" role="status" aria-live="polite">
      {status === 'offlineReady' && <span>Pronta anche offline</span>}
      {status === 'updated' && <span>App aggiornata</span>}
      {(status === 'needRefresh' || status === 'updating') && (
        <>
          <span>Nuova versione</span>
          {status === 'needRefresh' && (
            <button type="button" class="toast-btn ghost" onClick={() => store.dismiss()}>Più tardi</button>
          )}
          <button type="button" class="toast-btn" disabled={status === 'updating'} onClick={update}>
            {status === 'updating' ? 'Aggiorno…' : 'Aggiorna'}
          </button>
        </>
      )}
      {status === 'failed' && (
        <>
          <span>Aggiornamento non riuscito</span>
          <button type="button" class="toast-btn" onClick={update}>Riprova</button>
        </>
      )}
    </div>
  )
}
