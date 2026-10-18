import { useState } from 'react'
import RatingPicker from './RatingPicker'
import Button from './ui/Button'
import { useApi } from '@/lib/api'
import { formatRating, isSpecial } from '@/lib/utils'
import type { SeasonRating } from '@/types'
import { Plus, Trash2, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  entryId: string
  totalSeasons: number | null
  seasonRatings: SeasonRating[]
  onChange: () => void  // triggers parent refetch
  readOnly?: boolean
}

export default function SeasonRatingsPanel({ entryId, totalSeasons, seasonRatings, onChange, readOnly }: Props) {
  const api = useApi()
  const [editing, setEditing] = useState<number | null>(null)
  const [pending, setPending] = useState<Record<number, number | null>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const knownSeasons = seasonRatings.map(s => s.seasonNumber)
  const maxKnown = Math.max(0, ...knownSeasons)
  const slots = totalSeasons
    ? Array.from({ length: totalSeasons }, (_, i) => i + 1)
    : Array.from({ length: Math.max(maxKnown + 1, 1) }, (_, i) => i + 1)

  function getRating(season: number): number | null {
    if (season in pending) return pending[season] ?? null
    return seasonRatings.find(s => s.seasonNumber === season)?.rating ?? null
  }

  async function save(season: number) {
    const rating = getRating(season)
    setSaving(true)
    try {
      const res = await api.put<{ ok: boolean; notice?: string }>(
        `/entries/${entryId}/seasons/${season}`,
        { rating }
      )
      if (res.notice) { setNotice(res.notice); setTimeout(() => setNotice(''), 4000) }
      setPending(p => { const n = { ...p }; delete n[season]; return n })
      setEditing(null)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function removeSeason(season: number) {
    await api.del(`/entries/${entryId}/seasons/${season}`)
    onChange()
  }

  const avg = (() => {
    const valid = seasonRatings.map(s => s.rating).filter((r): r is number => r !== null)
    if (!valid.length) return null
    return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1)
  })()

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p className="text-xs bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-lg px-3 py-2">{notice}</p>
      )}

      {avg !== null && (
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--c-accent)]">
          <Star size={14} />
          Series average: {avg}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {slots.map(season => {
          const rating = getRating(season)
          const isOpen = editing === season
          return (
            <div key={season} className="rounded-lg border border-[var(--c-border)] overflow-hidden">
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2',
                  !readOnly && 'cursor-pointer hover:bg-[var(--c-surface)]',
                )}
                onClick={() => !readOnly && setEditing(isOpen ? null : season)}
              >
                <span className="text-sm font-medium text-[var(--c-muted)] w-20 shrink-0">
                  Season {season}
                </span>
                <span className={cn(
                  'text-sm font-semibold',
                  rating === null ? 'text-[var(--c-subtle)]' : isSpecial(rating) ? 'text-[var(--c-star)]' : 'text-[var(--c-accent)]'
                )}>
                  {formatRating(rating)}
                </span>
                {!readOnly && (
                  <div className="ml-auto flex gap-1">
                    {rating !== null && (
                      <button
                        onClick={e => { e.stopPropagation(); removeSeason(season) }}
                        className="p-1 rounded hover:text-red-500 text-[var(--c-subtle)] transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isOpen && !readOnly && (
                <div className="px-3 pb-3 border-t border-[var(--c-border)] pt-3 bg-[var(--c-surface)]">
                  <RatingPicker
                    value={rating}
                    onChange={v => setPending(p => ({ ...p, [season]: v }))}
                    disabled={saving}
                  />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" loading={saving} onClick={() => save(season)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add extra season slot */}
      {!readOnly && !totalSeasons && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(slots.length + 1)}
          className="self-start"
        >
          <Plus size={14} />
          Add season
        </Button>
      )}
    </div>
  )
}
