import { describe, expect, test } from 'vitest'
import { createNavHistory, type NavWindow } from '../src/nav-history'

/** Cronologia finta: voci con hash e stato, come quella del browser. */
function fakeWindow(start = '#/') {
  const entries: { hash: string; state: unknown }[] = [{ hash: start, state: null }]
  let i = 0
  const listeners: (() => void)[] = []
  const fire = () => listeners.forEach((l) => l())
  const win: NavWindow & { push(h: string): void; forward(): void; entries: typeof entries; scrollY: number } = {
    scrollY: 0,
    location: { get hash() { return entries[i].hash } },
    history: {
      get state() { return entries[i].state },
      replaceState(state, _u, url) { entries[i] = { hash: url ?? entries[i].hash, state } },
      back() { if (i > 0) { i--; fire() } },
    },
    dispatchEvent() { fire(); return true },
    push(h) { entries.splice(i + 1); entries.push({ hash: h, state: null }); i++; fire() },
    forward() { if (i < entries.length - 1) { i++; fire() } },
    entries,
  }
  return { win, onChange: (l: () => void) => listeners.push(l), get index() { return i } }
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, get length() { return m.size },
  }
}

function setup(start = '#/') {
  const f = fakeWindow(start)
  const nav = createNavHistory(f.win, memoryStorage())
  const steps: ReturnType<typeof nav.sync>[] = []
  f.onChange(() => { nav.remember(f.win.scrollY); steps.push(nav.sync()) })
  steps.push(nav.sync())
  return { win: f.win, nav, steps, last: () => steps[steps.length - 1], get index() { return f.index } }
}

describe('cronologia dell\'app', () => {
  test('distingue apertura, nuova pagina e ritorno', () => {
    const s = setup()
    expect(s.last().kind).toBe('init')
    s.win.push('#/songs')
    expect(s.last().kind).toBe('push')
    s.win.history.back()
    expect(s.last().kind).toBe('pop')
    s.win.forward()
    expect(s.last().kind).toBe('pop')
  })

  test('tornando a una pagina restituisce lo scroll che aveva', () => {
    const s = setup()
    s.win.scrollY = 420
    s.win.push('#/songs/a')
    expect(s.last().y).toBe(0)
    s.win.scrollY = 90
    s.win.history.back()
    expect(s.last().y).toBe(420)
    s.win.forward()
    expect(s.last().y).toBe(90)
  })

  test('«Indietro» torna alla voce precedente invece di aggiungerne una', () => {
    const s = setup()
    s.win.push('#/songs')
    s.win.push('#/songs/a')
    s.nav.back('#/songs')
    expect(s.win.location.hash).toBe('#/songs')
    expect(s.index).toBe(1)
    expect(s.last().kind).toBe('pop')
  })

  test('«Indietro» senza pagine precedenti nell\'app sostituisce la voce con quella di riserva', () => {
    const s = setup('#/settings')
    s.nav.back('#/')
    expect(s.win.location.hash).toBe('#/')
    expect(s.win.entries).toHaveLength(1)
    expect(s.last().kind).toBe('replace')
  })

  test('backTo torna indietro solo se la voce precedente è proprio quella', () => {
    const s = setup('#/songs')
    s.win.push('#/songs/a/triage')
    s.nav.backTo('#/songs/a')
    expect(s.win.location.hash).toBe('#/songs/a')
    expect(s.win.entries.map((e) => e.hash)).toEqual(['#/songs', '#/songs/a'])
    s.win.history.back()
    expect(s.win.location.hash).toBe('#/songs')

    const t = setup('#/songs/a')
    t.win.push('#/songs/a?item=x')
    t.nav.backTo('#/songs/a')
    expect(t.index).toBe(0)
  })

  test('replace sostituisce la voce corrente', () => {
    const s = setup('#/songs')
    s.win.push('#/songs/new')
    s.nav.replace('#/songs/b/analyzing')
    expect(s.win.entries.map((e) => e.hash)).toEqual(['#/songs', '#/songs/b/analyzing'])
    expect(s.last()).toMatchObject({ kind: 'replace', y: 0 })
  })

  test('dopo un ricaricamento riconosce ancora le voci precedenti', () => {
    const f = fakeWindow('#/')
    const storage = memoryStorage()
    const a = createNavHistory(f.win, storage)
    f.onChange(() => a.sync())
    a.sync()
    f.win.push('#/songs')
    const b = createNavHistory(f.win, storage)
    expect(b.sync().kind).toBe('init')
    b.back('#/')
    expect(f.win.location.hash).toBe('#/')
    expect(f.win.entries).toHaveLength(2)
  })
})
