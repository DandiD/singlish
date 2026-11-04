import { useEffect, useState } from 'preact/hooks'

/**
 * Un contatore che cambia quando l'app torna in primo piano e a mezzanotte: le schermate che dipendono
 * dalla data (Oggi) lo mettono fra le dipendenze della query, così lasciate aperte la sera si aggiornano al mattino.
 */
export function useDayTick(now: () => Date): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => { if (document.visibilityState !== 'hidden') setTick((t) => t + 1) }
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('focus', bump)
    const n = now()
    const nextDay = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1)
    const timer = setTimeout(() => setTick((t) => t + 1), Math.min(nextDay.getTime() - n.getTime(), 2 ** 31 - 1))
    return () => {
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('focus', bump)
      clearTimeout(timer)
    }
  }, [tick])
  return tick
}
