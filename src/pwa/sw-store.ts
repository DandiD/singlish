export type SwStatus = 'idle' | 'offlineReady' | 'needRefresh' | 'updating' | 'updated' | 'failed'

export type RegisterFn = (opts: { onNeedRefresh(): void; onOfflineReady(): void }) => (reload?: boolean) => Promise<void>

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

const FLAG = 'singlish:updating'

export interface SwStore {
  get(): { status: SwStatus }
  subscribe(fn: () => void): () => void
  /** L'utente ha accettato: segno in sessionStorage, poi il worker nuovo prende il controllo e la pagina si ricarica. */
  applyUpdate(): Promise<void>
  fail(): void
  dismiss(): void
}

export function createSwStore(register: RegisterFn, storage: Storage | null = safeSession()): SwStore {
  let status: SwStatus = 'idle'
  if (storage?.getItem(FLAG)) {
    storage.removeItem(FLAG)
    status = 'updated'
  }
  const subs = new Set<() => void>()
  const set = (s: SwStatus) => {
    status = s
    subs.forEach((fn) => fn())
  }
  const update = register({
    onNeedRefresh: () => set('needRefresh'),
    onOfflineReady: () => set('offlineReady'),
  })
  return {
    get: () => ({ status }),
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    applyUpdate: async () => {
      storage?.setItem(FLAG, '1')
      set('updating')
      await update(true)
    },
    fail: () => {
      storage?.removeItem(FLAG)
      set('failed')
    },
    dismiss: () => set('idle'),
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
