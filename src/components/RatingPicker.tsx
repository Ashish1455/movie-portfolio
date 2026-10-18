import { cn, formatRating } from '@/lib/utils'

interface Props {
  value: number | null
  onChange: (r: number | null) => void
  disabled?: boolean
}

export default function RatingPicker({ value, onChange, disabled }: Props) {
  const ratings = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {ratings.map(r => {
          const special = r >= 11
          const active = value === r
          return (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? null : r)}
              title={special ? `Special rating ${r} — only one item can hold this` : `Rate ${r}/10`}
              className={cn(
                'w-9 h-9 rounded-lg text-sm font-semibold transition-all focus-visible:outline-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                special
                  ? cn(
                      'ring-2 ring-[var(--c-star)]',
                      active
                        ? 'bg-[var(--c-star)] text-white'
                        : 'bg-[var(--c-surface)] text-[var(--c-star)] hover:bg-[var(--c-star)] hover:text-white',
                    )
                  : cn(
                      active
                        ? 'bg-[var(--c-accent)] text-white'
                        : 'bg-[var(--c-surface)] text-[var(--c-text)] hover:bg-[var(--c-accent)] hover:text-white',
                    ),
              )}
            >
              {special ? `★${r}` : r}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-[var(--c-subtle)]">
        1–10 = regular · ★11–★15 = special (unique per user) · click again to clear
      </p>
      {value !== null && (
        <p className="text-sm font-medium text-[var(--c-accent)]">Selected: {formatRating(value)}</p>
      )}
    </div>
  )
}
