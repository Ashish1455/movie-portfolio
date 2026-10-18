import type { PortfolioEntry } from '@/types'
import { formatRating, isSpecial, categoryLabel, cn } from '@/lib/utils'
import { Film, Star, Clock } from 'lucide-react'

interface Props {
  entry: PortfolioEntry
  onClick: () => void
}

export default function EntryCard({ entry, onClick }: Props) {
  const special = isSpecial(entry.rating)

  return (
    <button
      onClick={onClick}
      className="group text-left w-full flex flex-col rounded-xl overflow-hidden border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-accent)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-accent)]"
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] bg-[var(--c-surface)] overflow-hidden">
        {entry.posterUrl
          ? (
            <img
              src={entry.posterUrl}
              alt={entry.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          )
          : (
            <div className="w-full h-full flex items-center justify-center">
              <Film size={32} className="text-[var(--c-subtle)]" />
            </div>
          )
        }

        {/* Rating badge */}
        {entry.rating !== null && (
          <div className={cn(
            'absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold',
            special ? 'bg-[var(--c-star)] text-white' : 'bg-black/70 text-white'
          )}>
            <Star size={10} />
            {formatRating(entry.rating)}
          </div>
        )}

        {/* Watching badge */}
        {entry.status === 'watching' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-blue-500 text-white px-1.5 py-0.5 rounded-md text-xs font-medium">
            <Clock size={10} />
            Watching
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="font-semibold text-xs text-[var(--c-text)] line-clamp-2 leading-snug mb-0.5">
          {entry.title}
        </p>
        <p className="text-xs text-[var(--c-muted)]">
          {entry.year && <span>{entry.year} · </span>}
          {categoryLabel(entry.category)}
        </p>
      </div>
    </button>
  )
}
