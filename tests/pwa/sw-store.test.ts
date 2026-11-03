import { describe, expect, test, vi } from 'vitest'
import { createSwStore, type RegisterFn } from '../../src/pwa/sw-store'

function fakeRegister() {
  const hooks: { onNeedRefresh?: () => void; onOfflineReady?: () => void } = {}
  const update = vi.fn(async (_reload?: boolean) => {})
  const register: RegisterFn = (opts) => {
    Object.assign(hooks, opts)
    return update
  }
  return { hooks, update, register }
}

describe('createSwStore', () => {
  test('segnala nuova versione e pronta offline', () => {
    const f = fakeRegister()
    const store = createSwStore(f.register)
    const seen: string[] = []
    store.subscribe(() => seen.push(store.get().status))
    f.hooks.onOfflineReady!()
    expect(store.get().status).toBe('offlineReady')
    f.hooks.onNeedRefresh!()
    expect(store.get().status).toBe('needRefresh')
    expect(seen).toEqual(['offlineReady', 'needRefresh'])
  })

  test('applyUpdate segna il passaggio e chiede al worker di attivarsi', async () => {
    const f = fakeRegister()
    const storage = new Map<string, string>()
    const store = createSwStore(f.register, { setItem: (k, v) => storage.set(k, v), getItem: (k) => storage.get(k) ?? null, removeItem: (k) => storage.delete(k) })
    f.hooks.onNeedRefresh!()
    await store.applyUpdate()
    expect(store.get().status).toBe('updating')
    expect(storage.get('singlish:updating')).toBe('1')
    expect(f.update).toHaveBeenCalledWith(true)
  })

  test('dopo il ricaricamento dice che l\'aggiornamento è fatto, una volta sola', () => {
    const storage = new Map<string, string>([['singlish:updating', '1']])
    const s = { setItem: (k: string, v: string) => storage.set(k, v), getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => storage.delete(k) }
    expect(createSwStore(fakeRegister().register, s).get().status).toBe('updated')
    expect(createSwStore(fakeRegister().register, s).get().status).toBe('idle')
  })

  test('fail e dismiss cambiano lo stato', () => {
    const f = fakeRegister()
    const store = createSwStore(f.register)
    f.hooks.onNeedRefresh!()
    store.fail()
    expect(store.get().status).toBe('failed')
    store.dismiss()
    expect(store.get().status).toBe('idle')
  })
})
