import { useEffect } from 'preact/hooks'

type Sentinel = { release(): Promise<void>; released?: boolean }

/**
 * Tiene acceso lo schermo finché `active` è vero; lo rilascia quando diventa falso o allo smontaggio.
 * Il sistema toglie il blocco quando la scheda si nasconde: tornandoci lo si richiede.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    let lock: Sentinel | null = null
    let pending = false
    let done = false
    const request = () => {
      if (pending || (lock && !lock.released)) return
      try {
        const wl = (navigator as any).wakeLock
        if (!wl?.request) return
        pending = true
        Promise.resolve(wl.request('screen')).then(
          (l: Sentinel) => {
            pending = false
            // Uscita prima della risposta: il blocco arrivato tardi si rilascia subito.
            if (done) free(l)
            else lock = l
          },
          () => { pending = false },
        )
      } catch { pending = false }
    }
    const onVis = () => { if (document.visibilityState === 'visible') request() }
    request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', onVis)
      const l = lock
      lock = null
      free(l)
    }
  }, [active])
}

function free(l: Sentinel | null) {
  try { void l?.release().catch(() => {}) } catch { /* ignore */ }
}
