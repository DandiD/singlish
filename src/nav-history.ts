/**
 * Cronologia dell'app sopra quella del browser. Ogni voce riceve un indice in `history.state`:
 * così si distingue una pagina nuova da un ritorno (tasto Indietro o Avanti) e si ritrova lo scroll.
 */
export type NavKind = 'init' | 'push' | 'pop' | 'replace'
export type NavStep = { kind: NavKind; y: number }

export type NavWindow = {
  location: { readonly hash: string }
  history: {
    readonly state: unknown
    replaceState(state: unknown, unused: string, url?: string): void
    back(): void
  }
  dispatchEvent(e: Event): boolean
}

const KEY = 'singlish:nav'

type Saved = { hashes: string[]; ys: number[] }

export function createNavHistory(win: NavWindow, storage: Storage) {
  let saved: Saved = { hashes: [], ys: [] }
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as Saved | null
    if (raw && Array.isArray(raw.hashes) && Array.isArray(raw.ys)) saved = raw
  } catch { /* stato illeggibile: si riparte */ }
  let idx = -1
  let replacing = false

  const hash = () => win.location.hash || '#/'
  const persist = () => { try { storage.setItem(KEY, JSON.stringify(saved)) } catch { /* pieno o vietato */ } }
  const stateIdx = () => {
    const s = win.history.state as { idx?: unknown } | null
    return typeof s?.idx === 'number' ? s.idx : null
  }
  const fresh = (i: number) => {
    idx = i
    saved.hashes.length = i
    saved.ys.length = i
    saved.hashes[i] = hash()
    saved.ys[i] = 0
    win.history.replaceState({ idx: i }, '')
  }

  return {
    /** Lo scroll della pagina che si sta lasciando. */
    remember(y: number) {
      if (idx >= 0) { saved.ys[idx] = Math.round(y); persist() }
    },
    /** Da chiamare a ogni cambio di hash (e all'avvio): dice che tipo di passaggio è stato. */
    sync(): NavStep {
      const known = stateIdx()
      let step: NavStep
      if (replacing) {
        replacing = false
        saved.hashes[idx] = hash()
        saved.ys[idx] = 0
        step = { kind: 'replace', y: 0 }
      } else if (known !== null) {
        const first = idx < 0
        idx = known
        saved.hashes[idx] = hash()
        step = { kind: first ? 'init' : 'pop', y: saved.ys[idx] ?? 0 }
      } else if (idx < 0) {
        fresh(0)
        step = { kind: 'init', y: 0 }
      } else {
        fresh(idx + 1)
        step = { kind: 'push', y: 0 }
      }
      persist()
      return step
    },
    /** Torna alla pagina precedente dell'app; se non c'è, sostituisce questa con `fallback`. */
    back(fallback: string) {
      if (idx > 0 && saved.hashes[idx - 1] != null) win.history.back()
      else this.replace(fallback)
    },
    /** Torna indietro solo se la voce precedente è proprio `target`; altrimenti la sostituisce. */
    backTo(target: string) {
      if (idx > 0 && saved.hashes[idx - 1] === target) win.history.back()
      else this.replace(target)
    },
    /** Sostituisce la voce corrente (esiti di un'azione: il ritorno non deve ripassarci). */
    replace(target: string) {
      if (hash() === target) return
      // La voce precedente è già `target`: si torna a quella invece di lasciarne due uguali (un Indietro a vuoto).
      if (idx > 0 && saved.hashes[idx - 1] === target) { win.history.back(); return }
      replacing = true
      win.history.replaceState({ idx }, '', target)
      win.dispatchEvent(new Event('hashchange'))
    },
  }
}

export type NavHistory = ReturnType<typeof createNavHistory>
