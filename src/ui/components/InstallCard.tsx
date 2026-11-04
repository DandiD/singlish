import type { InstallState } from '../../pwa/install'
import { Icon } from './Icon'

export function InstallCard({ state, onInstall }: { state: InstallState; onInstall(): void }) {
  return (
    <div class="install-card">
      <img class="install-icon" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={48} height={48} />
      {state === 'installed' && <p class="note">App installata su questo dispositivo.</p>}
      {state === 'available' && (
        <>
          <p class="note grow">Aprila dalla schermata Home, a schermo intero e anche senza rete.</p>
          <button type="button" class="btn primary" onClick={onInstall}>
            <Icon name="download" size={18} />
            Installa Singlish
          </button>
        </>
      )}
      {state === 'ios' && (
        <p class="note">
          In Safari tocca <Icon name="share" size={16} /> Condividi, poi Aggiungi alla schermata Home.
        </p>
      )}
      {state === 'unsupported' && (
        <p class="note">Dal menu del browser scegli «Installa app» o «Aggiungi a schermata Home».</p>
      )}
    </div>
  )
}
