import { useLayoutEffect, useRef, useState } from 'preact/hooks'

export type MoreMenuItem = { text: string; onSelect(): void; danger?: boolean }

/** Pulsante «⋯» con un piccolo menu: Invio, Spazio, Freccia giù o tocco lo apre; Esc (ovunque sia il fuoco) lo chiude
 *  e riporta il fuoco al pulsante; un tocco fuori o il fuoco che esce dal menu lo chiudono. */
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

  // Aperto: il fuoco va sulla prima voce. Effetti «layout»: partono subito dopo il render, non un frame dopo,
  // così un Esc premuto appena il menu compare viene già ascoltato.
  useLayoutEffect(() => {
    if (open) entries()[0]?.focus()
  }, [open])

  // Un tocco fuori chiude senza spostare il fuoco; Esc chiude ovunque sia il fuoco (anche prima che entri nel menu).
  useLayoutEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close(true)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Invio e Spazio restano al clic nativo (che apre e chiude); Freccia giù apre e porta sulla prima voce.
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (open) entries()[0]?.focus()
      else setOpen(true)
    }
  }
  // Il fuoco che va su un altro elemento fuori dal menu (Tab, VoiceOver su un altro «⋯») lo chiude.
  // Senza relatedTarget (fuoco sul body, clic su un'area non focalizzabile) decide il pointerdown fuori:
  // chiudere qui annullerebbe il clic su una voce in Safari, dove i pulsanti non prendono il fuoco.
  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (open && next && !wrap.current?.contains(next)) setOpen(false)
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
    <div class="more-menu" ref={wrap} onFocusOut={onFocusOut}>
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
