import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import type { Milestone } from '../../domain/milestones'
import { buzz } from '../haptics'

/** Foglio di un traguardo (come UnlockSheet): titolo, frase, «Bene». Un impulso e una vibrazione all'apertura. */
export function MilestoneSheet({ milestone, onClose, haptics }: { milestone: Milestone; onClose(): void; haptics?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => opener?.focus?.()
  }, [])
  useEffect(() => { buzz({ haptics }) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div class="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section class="sheet milestone" role="dialog" aria-modal="true" aria-label={milestone.title} tabIndex={-1} ref={ref}>
        <div class="sheet-handle" aria-hidden="true" />
        <span class="section-label">TRAGUARDO</span>
        <h1>{milestone.title}</h1>
        <p>{milestone.text}</p>
        <button type="button" class="btn primary cta" onClick={onClose}>Bene</button>
      </section>
    </div>
  )
}
