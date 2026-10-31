import type { Rating } from '../../db/types'

const LABELS: [Rating, string][] = [
  [1, 'Di nuovo'],
  [2, 'Difficile'],
  [3, 'Bene'],
  [4, 'Facile'],
]

export const RATING_LABEL: Record<Rating, string> = { 1: 'Di nuovo', 2: 'Difficile', 3: 'Bene', 4: 'Facile' }

export function RatingBar({ selected, onSelect }: { selected?: Rating; onSelect(r: Rating): void }) {
  return (
    <div class="rating-bar" role="group" aria-label="Voto">
      {LABELS.map(([r, label]) => (
        <button
          key={r}
          type="button"
          class={`rating-btn r${r}${selected === r ? ' on' : ''}`}
          aria-pressed={selected === undefined ? undefined : selected === r}
          onClick={() => onSelect(r)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
