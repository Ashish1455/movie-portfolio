import { useState } from 'react'
import { useApi } from '@/lib/api'
import type { WatchDate, WhereWatched } from '@/types'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'
import { Trash2, Plus, CalendarDays } from 'lucide-react'
import { whereWatchedLabel } from '@/lib/utils'
import { format } from 'date-fns'

interface Props {
  entryId: string
  watchDates: WatchDate[]
  onChange: () => void
  readOnly?: boolean
}

const WHERE_OPTS = [
  { value: '', label: 'Where watched (optional)' },
  { value: 'theater', label: 'Theater' },
  { value: 'ott', label: 'Streaming' },
  { value: 'other', label: 'Other' },
]

export default function WatchDatesPanel({ entryId, watchDates, onChange, readOnly }: Props) {
  const api = useApi()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ watchedAt: '', whereWatched: '' as WhereWatched | '', platform: '', watchedWith: '' })
  const [saving, setSaving] = useState(false)

  async function add() {
    setSaving(true)
    try {
      await api.post(`/entries/${entryId}/watch-dates`, {
        watchedAt: form.watchedAt || null,
        whereWatched: form.whereWatched || null,
        platform: form.platform.trim() || null,
        watchedWith: form.watchedWith.trim() || null,
      })
      setForm({ watchedAt: '', whereWatched: '', platform: '', watchedWith: '' })
      setAdding(false)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await api.del(`/entries/${entryId}/watch-dates/${id}`)
    onChange()
  }

  return (
    <div className="flex flex-col gap-3">
      {watchDates.length === 0 && (
        <p className="text-sm text-[var(--c-subtle)]">No watch dates recorded yet.</p>
      )}

      {watchDates.map(wd => (
        <div key={wd.id} className="flex items-start gap-3 rounded-lg border border-[var(--c-border)] px-3 py-2.5">
          <CalendarDays size={15} className="text-[var(--c-muted)] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--c-text)]">
              {wd.watchedAt ? format(new Date(wd.watchedAt), 'MMM d, yyyy') : 'Date not specified'}
            </p>
            <p className="text-xs text-[var(--c-muted)]">
              {[
                wd.whereWatched && whereWatchedLabel(wd.whereWatched),
                wd.platform,
              ].filter(Boolean).join(' · ')}
            </p>
            {wd.watchedWith && (
              <p className="text-xs text-[var(--c-subtle)] mt-0.5">With: {wd.watchedWith}</p>
            )}
          </div>
          {!readOnly && (
            <button
              onClick={() => remove(wd.id)}
              className="text-[var(--c-subtle)] hover:text-red-500 transition p-1"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        adding ? (
          <div className="flex flex-col gap-3 border border-[var(--c-border)] rounded-lg p-3 bg-[var(--c-surface)]">
            <Input
              label="Date watched"
              type="date"
              value={form.watchedAt}
              onChange={e => setForm(f => ({ ...f, watchedAt: e.target.value }))}
            />
            <Select
              label="Where watched"
              value={form.whereWatched}
              onChange={e => setForm(f => ({ ...f, whereWatched: e.target.value as WhereWatched | '' }))}
              options={WHERE_OPTS}
            />
            <Input
              label="Platform"
              placeholder="e.g. Netflix, Prime, Blu-ray…"
              value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            />
            <Input
              label="Watched with (optional)"
              placeholder="e.g. friends, family…"
              value={form.watchedWith}
              onChange={e => setForm(f => ({ ...f, watchedWith: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={saving} onClick={add}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
            <Plus size={14} />
            {watchDates.length > 0 ? 'Add rewatch' : 'Add watch date'}
          </Button>
        )
      )}
    </div>
  )
}
