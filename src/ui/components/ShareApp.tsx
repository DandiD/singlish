import { useState } from 'preact/hooks'
import { Icon } from './Icon'

/** Le parti di `navigator` che servono: iniettabili nei test. */
export interface ShareNav {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText(text: string): Promise<void> }
}

/** Il link pubblico dell'app (la base della build, es. /singlish/). */
export const appUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href

/** «Condividi app»: menu di condivisione del sistema, altrimenti il link copiato negli appunti. */
export function ShareApp({ url = appUrl(), nav = navigator }: { url?: string; nav?: ShareNav }) {
  const [msg, setMsg] = useState('')
  const share = async () => {
    setMsg('')
    if (nav.share) {
      try {
        await nav.share({ title: 'Singlish', text: 'Impara l’inglese dalle canzoni.', url })
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return // menu chiuso senza scegliere
      }
    }
    try {
      if (!nav.clipboard) throw new Error('no clipboard')
      await nav.clipboard.writeText(url)
      setMsg('Link copiato')
    } catch {
      setMsg(`Copia questo link: ${url}`)
    }
  }
  return (
    <div class="share-app">
      <button type="button" class="btn outline" onClick={() => void share()}>
        <Icon name="share" size={18} />
        Condividi app
      </button>
      <p role="status" class="note">{msg}</p>
    </div>
  )
}
