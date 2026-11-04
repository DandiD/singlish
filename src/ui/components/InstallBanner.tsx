import type { InstallState } from '../../pwa/install'
import { Icon } from './Icon'

/** Invito a installare in Oggi: solo quando si può davvero (richiesta del browser o iOS). */
export function InstallBanner({ state, onInstall, onDismiss }: { state: InstallState; onInstall(): void; onDismiss(): void }) {
  if (state !== 'available' && state !== 'ios') return null
  return (
    <section class="install-banner" aria-label="Installa Singlish">
      <img class="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={40} height={40} />
      {state === 'available' ? (
        <>
          <p class="note grow">Installala: si apre dalla Home, a schermo intero e anche senza rete.</p>
          <button type="button" class="btn primary" onClick={onInstall}>
            <Icon name="download" size={18} />
            Installa
          </button>
        </>
      ) : (
        <p class="note grow">
          Per installarla, in Safari tocca <Icon name="share" size={16} /> Condividi, poi Aggiungi alla schermata Home.
        </p>
      )}
      <button type="button" class="icon-btn" aria-label="Chiudi" onClick={onDismiss}>
        <Icon name="close" size={18} />
      </button>
    </section>
  )
}
