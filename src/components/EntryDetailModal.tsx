import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Badge from './ui/Badge'
import SeasonRatingsPanel from './SeasonRatingsPanel'
import WatchDatesPanel from './WatchDatesPanel'
import ExternalLinksPanel from './ExternalLinksPanel'
import AddEditEntryModal from './AddEditEntryModal'
import CommentSection from './CommentSection'
import ReactionTimeline from './ReactionTimeline'
import { useApi } from '@/lib/api'
import type { PortfolioEntry } from '@/types'
import { formatRating, isSpecial, categoryLabel, cn } from '@/lib/utils'
import { Film, Star, Edit2, Trash2, ChevronDown } from 'lucide-react'

interface Props {
  entryId: string
  onClose: () => void
  readOnly?: boolean
  isFriend?: boolean
  isOwner?: boolean
}

type Tab = 'info' | 'seasons' | 'watches' | 'links' | 'comments' | 'timeline'

export default function EntryDetailModal({ entryId, onClose, readOnly, isFriend = false, isOwner = false }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('info')
  const [showEdit, setShowEdit] = useState(false)
  const [showExp, setShowExp] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: entry, isLoading, refetch } = useQuery<PortfolioEntry>({
    queryKey: ['entry', entryId],
    queryFn: () => api.get<PortfolioEntry>(`/entries/${entryId}`),
  })

  function invalidate() {
    refetch()
    qc.invalidateQueries({ queryKey: ['entries'] })
    qc.invalidateQueries({ queryKey: ['top12'] })
  }

  async function deleteEntry() {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.del(`/entries/${entryId}`)
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['top12'] })
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: 'Info & Reviews' },
    ...(entry?.isSeries ? [{ id: 'seasons' as Tab, label: 'Seasons' }] : []),
    { id: 'watches', label: 'Watch dates' },
    { id: 'links', label: 'Links' },
    ...(isFriend || isOwner ? [{ id: 'comments' as Tab, label: 'Comments' }] : []),
    ...(isFriend || isOwner ? [{ id: 'timeline' as Tab, label: 'Timeline' }] : []),
  ]

  if (isLoading || !entry) {
    return (
      <Modal open onClose={onClose} title="Loading…" size="lg">
        <div className="h-32 flex items-center justify-center">
          <span className="w-6 h-6 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </Modal>
    )
  }

  const ratingDisplay = formatRating(entry.rating)
  const special = isSpecial(entry.rating)

  return (
    <>
      <Modal open onClose={onClose} title={entry.title} size="xl">
        {/* Header strip */}
        <div className="flex gap-4 pb-4 mb-4 border-b border-[var(--c-border)]">
          {/* Poster */}
          <div className="w-24 shrink-0 rounded-lg overflow-hidden bg-[var(--c-surface)] aspect-[2/3] flex items-center justify-center">
            {entry.posterUrl
              ? <img src={entry.posterUrl} alt={entry.title} className="w-full h-full object-cover" />
              : <Film size={24} className="text-[var(--c-subtle)]" />
            }
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-[var(--c-text)] leading-snug">{entry.title}</h3>
            <p className="text-sm text-[var(--c-muted)] mb-2">{entry.year}</p>

            <div className="flex flex-wrap gap-1.5 mb-3">
              <Badge color={entry.category === 'movie' ? 'blue' : entry.category === 'anime' ? 'purple' : 'gray'}>
                {categoryLabel(entry.category)}
              </Badge>
              <Badge color={entry.status === 'completed' ? 'green' : 'yellow'}>
                {entry.status === 'completed' ? 'Completed' : 'Watching'}
              </Badge>
              {entry.isManualEntry && <Badge color="gray">Manual entry</Badge>}
            </div>

            {entry.rating !== null && (
              <div className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold',
                special
                  ? 'bg-[var(--c-star)] text-white'
                  : 'bg-[var(--c-accent)] text-white'
              )}>
                <Star size={13} />
                {ratingDisplay}
                {entry.isSeries && <span className="font-normal text-xs opacity-80">avg</span>}
              </div>
            )}

            {entry.lengthValue && (
              <p className="text-xs text-[var(--c-muted)] mt-2">
                {entry.lengthValue}
                {entry.lengthType === 'runtime' ? '' : entry.lengthType === 'episodes' ? ' episodes' : ' seasons'}
              </p>
            )}
          </div>

          {/* Owner actions */}
          {!readOnly && (
            <div className="flex flex-col gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
                <Edit2 size={13} />
              </Button>
              <Button variant="ghost" size="sm" onClick={deleteEntry} loading={deleting}
                className="text-red-500 hover:text-red-600">
                <Trash2 size={13} />
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[var(--c-border)]">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-t-lg transition',
                tab === t.id
                  ? 'text-[var(--c-accent)] border-b-2 border-[var(--c-accent)]'
                  : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'info' && (
          <div className="flex flex-col gap-4">
            {entry.spoilerFreeReview ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)] mb-1.5">Review</p>
                <p className="text-sm text-[var(--c-text)] leading-relaxed whitespace-pre-wrap">{entry.spoilerFreeReview}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--c-subtle)]">No review written yet.</p>
            )}

            {entry.experienceWriteup && (
              <div className="border-t border-[var(--c-border)] pt-4">
                <button
                  onClick={() => setShowExp(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-[var(--c-accent)] hover:underline"
                >
                  Read my experience
                  <ChevronDown size={14} className={cn('transition', showExp && 'rotate-180')} />
                </button>
                <p className="text-xs text-[var(--c-subtle)] mt-0.5">⚠ Contains spoilers</p>
                {showExp && (
                  <p className="mt-3 text-sm text-[var(--c-text)] leading-relaxed whitespace-pre-wrap">
                    {entry.experienceWriteup}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'seasons' && entry.isSeries && (
          <SeasonRatingsPanel
            entryId={entry.id}
            totalSeasons={null}
            seasonRatings={entry.seasonRatings ?? []}
            onChange={invalidate}
            readOnly={readOnly}
          />
        )}

        {tab === 'watches' && (
          <WatchDatesPanel
            entryId={entry.id}
            watchDates={entry.watchDates ?? []}
            onChange={invalidate}
            readOnly={readOnly}
          />
        )}

        {tab === 'links' && (
          <ExternalLinksPanel
            entryId={entry.id}
            links={entry.externalLinks ?? []}
            onChange={invalidate}
            readOnly={readOnly}
          />
        )}

        {tab === 'comments' && (isFriend || isOwner) && (
          <CommentSection
            ownerId={entry.userId}
            entryId={entry.id}
            isFriend={isFriend}
            isOwner={isOwner}
          />
        )}

        {tab === 'timeline' && (isFriend || isOwner) && (
          <ReactionTimeline
            entryId={entry.id}
            isSeries={entry.isSeries}
            isOwner={isOwner}
            isFriend={isFriend}
          />
        )}
      </Modal>

      {showEdit && (
        <AddEditEntryModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={invalidate}
          entry={entry}
        />
      )}
    </>
  )
}
