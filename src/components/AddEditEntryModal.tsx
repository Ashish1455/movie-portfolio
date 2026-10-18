import { useState, useEffect } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'
import Textarea from './ui/Textarea'
import RatingPicker from './RatingPicker'
import { useApi } from '@/lib/api'
import type { OmdbDetail, PortfolioEntry, Category, Status, LengthType } from '@/types'
import { Film } from 'lucide-react'
import { detectSite } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  prefill?: OmdbDetail | null       // from OMDb search
  entry?: PortfolioEntry | null     // existing entry to edit
  isManual?: boolean               // manual-add flow
}

const CATEGORY_OPTS = [
  { value: 'movie', label: 'Movie' },
  { value: 'tv_series', label: 'TV Series' },
  { value: 'anime', label: 'Anime' },
  { value: 'documentary', label: 'Documentary' },
]

const STATUS_OPTS = [
  { value: 'completed', label: 'Completed' },
  { value: 'watching', label: 'Currently Watching' },
]

const LENGTH_TYPE_OPTS = [
  { value: 'runtime', label: 'Runtime' },
  { value: 'episodes', label: 'Episodes' },
  { value: 'seasons', label: 'Seasons' },
]

function guessCategory(type: string | null | undefined): Category {
  return type === 'series' ? 'tv_series' : 'movie'
}

export default function AddEditEntryModal({ open, onClose, onSaved, prefill, entry, isManual }: Props) {
  const api = useApi()
  const isEdit = !!entry

  // ── Form state ───────────────────────────────────────────────────────────
  const [title, setTitle]         = useState('')
  const [year, setYear]           = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [category, setCategory]   = useState<Category>('movie')
  const [status, setStatus]       = useState<Status>('completed')
  const [isSeries, setIsSeries]   = useState(false)
  const [lengthValue, setLengthValue] = useState('')
  const [lengthType, setLengthType]   = useState<LengthType>('runtime')
  const [rating, setRating]       = useState<number | null>(null)
  const [spoiler, setSpoiler]     = useState('')
  const [experience, setExperience] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [ratingNotice, setRatingNotice] = useState('')

  // Populate form when prefill / entry changes
  useEffect(() => {
    if (!open) return
    if (entry) {
      setTitle(entry.title)
      setYear(entry.year ?? '')
      setPosterUrl(entry.posterUrl ?? '')
      setCategory(entry.category)
      setStatus(entry.status)
      setIsSeries(entry.isSeries)
      setLengthValue(entry.lengthValue ?? '')
      setLengthType(entry.lengthType ?? 'runtime')
      setRating(entry.isSeries ? null : (entry.rating ?? null))
      setSpoiler(entry.spoilerFreeReview ?? '')
      setExperience(entry.experienceWriteup ?? '')
      setManualLink(entry.manualLink ?? '')
    } else if (prefill) {
      setTitle(prefill.title)
      setYear(prefill.year ?? '')
      setPosterUrl(prefill.posterUrl ?? '')
      setCategory(guessCategory(prefill.type))
      setIsSeries(prefill.type === 'series')
      setLengthType(prefill.type === 'series' ? 'episodes' : 'runtime')
      setLengthValue(prefill.runtime ?? '')
    } else {
      // manual / blank
      setTitle(''); setYear(''); setPosterUrl(''); setCategory('movie')
      setStatus('completed'); setIsSeries(false); setLengthValue(''); setLengthType('runtime')
      setRating(null); setSpoiler(''); setExperience(''); setManualLink('')
    }
    setError(''); setRatingNotice('')
  }, [open, entry, prefill])

  // Sync isSeries with category
  useEffect(() => {
    setIsSeries(category === 'tv_series')
  }, [category])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    if ((isManual && !isEdit) || entry?.isManualEntry) {
      if (!manualLink.trim()) { setError('A link (IMDb, Letterboxd or RT) is required for manual entries.'); return }
      if (!detectSite(manualLink)) { setError('Link must be from IMDb, Letterboxd or Rotten Tomatoes.'); return }
    }

    setSaving(true); setError(''); setRatingNotice('')
    try {
      let savedEntryId: string

      if (isEdit && entry) {
        // Update existing
        await api.patch(`/entries/${entry.id}`, {
          title, year: year || null, posterUrl: posterUrl || null,
          category, status, lengthValue: lengthValue || null,
          lengthType: lengthValue ? lengthType : null,
          spoilerFreeReview: spoiler || null,
          experienceWriteup: experience || null,
          manualLink: manualLink || null,
        })
        savedEntryId = entry.id
      } else {
        // Create new
        const created = await api.post<PortfolioEntry>('/entries', {
          imdbId: prefill?.imdbId ?? null,
          title, year: year || null, posterUrl: posterUrl || null,
          category, status, isSeries,
          lengthValue: lengthValue || null,
          lengthType: lengthValue ? lengthType : null,
          spoilerFreeReview: spoiler || null,
          experienceWriteup: experience || null,
          isManualEntry: isManual ?? false,
          manualLink: manualLink || null,
        })
        savedEntryId = created.id
      }

      // Set rating for non-series entries
      if (!isSeries && rating !== null) {
        const res = await api.post<{ ok: boolean; notice?: string }>(
          `/entries/${savedEntryId}/rating`, { rating }
        )
        if (res.notice) setRatingNotice(res.notice)
      }

      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Entry' : 'Add to Collection'}
      size="lg"
    >
      <div className="flex flex-col gap-5">

        {/* Poster preview + title/year row */}
        <div className="flex gap-4">
          <div className="w-20 shrink-0 rounded-lg overflow-hidden bg-[var(--c-surface)] aspect-[2/3] flex items-center justify-center">
            {posterUrl
              ? <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
              : <Film size={24} className="text-[var(--c-subtle)]" />
            }
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <Input
              label="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title"
            />
            <div className="flex gap-2">
              <Input
                label="Year"
                value={year}
                onChange={e => setYear(e.target.value)}
                placeholder="Year"
                className="w-24"
              />
              <div className="flex-1">
                <Input
                  label="Poster URL (optional)"
                  value={posterUrl}
                  onChange={e => setPosterUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Category & Status */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Category"
            value={category}
            onChange={e => setCategory(e.target.value as Category)}
            options={CATEGORY_OPTS}
          />
          <Select
            label="Status"
            value={status}
            onChange={e => setStatus(e.target.value as Status)}
            options={STATUS_OPTS}
          />
        </div>

        {/* Length */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Length"
              value={lengthValue}
              onChange={e => setLengthValue(e.target.value)}
              placeholder={isSeries ? 'e.g. 45, 8, 3' : 'e.g. 148 min'}
            />
          </div>
          {isSeries && (
            <Select
              label="Length type"
              value={lengthType}
              onChange={e => setLengthType(e.target.value as LengthType)}
              options={LENGTH_TYPE_OPTS}
              className="w-36"
            />
          )}
        </div>

        {/* Rating — only for non-series */}
        {!isSeries && (
          <div>
            <p className="text-sm font-medium text-[var(--c-muted)] mb-2">Rating</p>
            <RatingPicker value={rating} onChange={setRating} />
            {ratingNotice && (
              <p className="text-xs text-yellow-600 mt-1">{ratingNotice}</p>
            )}
          </div>
        )}

        {isSeries && (
          <p className="text-xs text-[var(--c-subtle)] bg-[var(--c-surface)] rounded-lg px-3 py-2">
            Season ratings are added after saving, from the entry detail view.
          </p>
        )}

        {/* Reviews */}
        <Textarea
          label="Spoiler-free review (always visible)"
          value={spoiler}
          onChange={e => setSpoiler(e.target.value)}
          placeholder="What you thought — no spoilers…"
          rows={3}
        />
        <Textarea
          label="My experience (may contain spoilers — hidden behind a link)"
          value={experience}
          onChange={e => setExperience(e.target.value)}
          placeholder="Deep thoughts, spoilers welcome…"
          rows={3}
        />

        {/* Manual link */}
        {(isManual || entry?.isManualEntry) && (
          <Input
            label="Link to this title (IMDb, Letterboxd or Rotten Tomatoes — required)"
            value={manualLink}
            onChange={e => setManualLink(e.target.value)}
            placeholder="https://www.imdb.com/title/tt…"
            error={error.includes('link') ? error : undefined}
          />
        )}

        {error && !error.includes('link') && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--c-border)]">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            {isEdit ? 'Save changes' : 'Add to collection'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
