import { useState } from 'react'
import type { PortfolioEntry, Category, Status } from '@/types'
import EntryCard from './EntryCard'
import EntryDetailModal from './EntryDetailModal'
import Select from './ui/Select'
import Input from './ui/Input'
import { Film, Search, LayoutGrid } from 'lucide-react'

interface Props {
  entries: PortfolioEntry[]
  readOnly?: boolean
  onRefetch?: () => void
}

export default function CollectionView({ entries, readOnly, onRefetch }: Props) {
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [status, setStatus]   = useState<Status | 'all'>('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [sort, setSort]       = useState('newest')
  const [q, setQ]             = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)

  // Client-side filtering
  const filtered = entries.filter(e => {
    if (category !== 'all' && e.category !== category) return false
    if (status !== 'all' && e.status !== status) return false
    if (ratingFilter !== 'all') {
      const r = e.rating
      if (ratingFilter === 'unrated' && r !== null) return false
      if (ratingFilter === 'special' && (r === null || r < 11)) return false
      if (ratingFilter === '9-10' && (r === null || r < 9 || r > 10)) return false
      if (ratingFilter === '6-8' && (r === null || r < 6 || r > 8)) return false
      if (ratingFilter === '1-5' && (r === null || r < 1 || r > 5)) return false
    }
    if (q) {
      return e.title.toLowerCase().includes(q.toLowerCase())
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1)
    if (sort === 'year') return (b.year ?? '').localeCompare(a.year ?? '')
    // default: newest
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center mb-5">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-subtle)]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search titles…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text)] placeholder:text-[var(--c-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]"
          />
        </div>

        <Select
          value={category}
          onChange={e => setCategory(e.target.value as Category | 'all')}
          options={[
            { value: 'all', label: 'All categories' },
            { value: 'movie', label: 'Movies' },
            { value: 'tv_series', label: 'TV Series' },
            { value: 'anime', label: 'Anime' },
            { value: 'documentary', label: 'Documentaries' },
          ]}
          className="w-40"
        />

        <Select
          value={status}
          onChange={e => setStatus(e.target.value as Status | 'all')}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'completed', label: 'Completed' },
            { value: 'watching', label: 'Watching' },
          ]}
          className="w-36"
        />

        <Select
          value={ratingFilter}
          onChange={e => setRatingFilter(e.target.value)}
          options={[
            { value: 'all', label: 'Any rating' },
            { value: 'special', label: '★ Special (11-15)' },
            { value: '9-10', label: '9–10' },
            { value: '6-8', label: '6–8' },
            { value: '1-5', label: '1–5' },
            { value: 'unrated', label: 'Unrated' },
          ]}
          className="w-36"
        />

        <Select
          value={sort}
          onChange={e => setSort(e.target.value)}
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'title', label: 'A → Z' },
            { value: 'rating', label: 'Highest rated' },
            { value: 'year', label: 'Release year' },
          ]}
          className="w-36"
        />
      </div>

      {/* Count */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--c-muted)] mb-4">
        <LayoutGrid size={13} />
        {sorted.length} {sorted.length === 1 ? 'title' : 'titles'}
        {filtered.length !== entries.length && ` (filtered from ${entries.length})`}
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="py-16 text-center">
          <Film size={40} className="text-[var(--c-subtle)] mx-auto mb-3" />
          <p className="text-sm text-[var(--c-muted)]">
            {entries.length === 0 ? 'Nothing in the collection yet.' : 'No titles match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {sorted.map(e => (
            <EntryCard key={e.id} entry={e} onClick={() => setDetailId(e.id)} />
          ))}
        </div>
      )}

      {detailId && (
        <EntryDetailModal
          entryId={detailId}
          onClose={() => { setDetailId(null); onRefetch?.() }}
          readOnly={readOnly}
        />
      )}
    </>
  )
}
