import { useEffect, useState } from 'preact/hooks'
import type { ErrorStore } from '../report'
import { Icon } from './Icon'

/** Avviso in basso per un'azione non riuscita: resta finché non lo si chiude, o 8 secondi. */
export function ErrorToast({ store }: { store: ErrorStore }) {
  const [message, setMessage] = useState(store.get())
  useEffect(() => store.subscribe(() => setMessage(store.get())), [store])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => store.dismiss(), 8000)
    return () => clearTimeout(t)
  }, [message])
  if (!message) return null
  return (
    <div class="toast error-toast" role="alert">
      <span>{message}</span>
      <button type="button" class="toast-btn ghost icon-only" aria-label="Chiudi avviso" onClick={() => store.dismiss()}>
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}
