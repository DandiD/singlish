import { useEffect, useRef, useState } from 'preact/hooks'

export type MoreMenuItem = { text: string; onSelect(): void; danger?: boolean }

/** Pulsante «⋯» con un piccolo menu: Invio o tocco lo apre, Esc e un tocco fuori lo chiudono, il fuoco torna al pulsante. */
export function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const entries = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  // Aperto: il fuoco va sulla prima voce.
  useEffect(() => {
    if (open) entries()[0]?.focus()
  }, [open])

  // Un tocco fuori chiude senza spostare il fuoco.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault() // niente clic nativo dopo: aprirebbe e richiuderebbe
      setOpen(true)
    }
  }
  const onMenuKey = (e: KeyboardEvent) => {
    const all = entries()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      all[(at + step + all.length) % all.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      all[e.key === 'Home' ? 0 : all.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div class="more-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        class="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <ul ref={list} class="more-menu-list" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map((it) => (
            <li key={it.text} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                class={it.danger ? 'danger' : undefined}
                onClick={() => {
                  close(true)
                  it.onSelect()
                }}
              >
                {it.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
