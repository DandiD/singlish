import { useEffect, useState } from 'preact/hooks'
import { Icon } from './Icon'

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])
  return online
}

/** Segnale discreto in alto: offline tutto funziona tranne l'analisi delle canzoni nuove. */
export function OfflineBadge() {
  const online = useOnline()
  if (online) return null
  return (
    <div class="offline-badge" role="status" title="Senza rete l'analisi delle canzoni aspetta: il resto funziona.">
      <Icon name="offline" size={16} />
      <span>Offline</span>
    </div>
  )
}
