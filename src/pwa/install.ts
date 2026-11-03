import { useEffect, useState } from 'preact/hooks'

/** L'evento `beforeinstallprompt` di Chrome/Edge/Android, catturato dallo script inline in index.html. */
export interface InstallPromptEvent {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __singlishInstall?: InstallPromptEvent | null
  }
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unsupported'

export interface InstallEnv {
  standalone: boolean
  ios: boolean
  prompt: InstallPromptEvent | null
}

export function installState(env: InstallEnv): InstallState {
  if (env.standalone) return 'installed'
  if (env.prompt) return 'available'
  if (env.ios) return 'ios'
  return 'unsupported'
}

/** iPhone, iPod, iPad; l'iPad recente si presenta come Mac ma ha il touch. */
export function isIos(ua: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && maxTouchPoints > 1
}

export function readInstallEnv(): InstallEnv {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return { standalone, ios: isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0), prompt: window.__singlishInstall ?? null }
}

export const INSTALL_EVENT = 'singlish:installable'

export function useInstall(): { state: InstallState; install(): Promise<void> } {
  const [env, setEnv] = useState(readInstallEnv)
  // Nella scheda del browser l'app installata non gira in standalone: lo si sa dall'esito o da `appinstalled`.
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const refresh = () => setEnv(readInstallEnv())
    const done = () => setInstalled(true)
    window.addEventListener(INSTALL_EVENT, refresh)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener(INSTALL_EVENT, refresh)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  const install = async () => {
    const p = env.prompt
    if (!p) return
    await p.prompt()
    const { outcome } = await p.userChoice
    window.__singlishInstall = null // un prompt si usa una volta sola
    if (outcome === 'accepted') setInstalled(true)
    setEnv(readInstallEnv())
  }
  return { state: installed ? 'installed' : installState(env), install }
}
