import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { TimelineReaction } from '@/types'
import Button from './ui/Button'
import { Clock, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  entryId: string
  isSeries: boolean
  isOwner: boolean
  isFriend?: boolean
}

const MOOD_PRESETS = ['😭', '😂', '🤯', '😱', '❤️', '🔥', '💔', '👏', '😤', '🥱']

function MarkerLabel({ r }: { r: TimelineReaction }) {
  if (r.markerSeason && r.markerEpisode) {
    return (
      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--c-surface)', color: 'var(--c-accent)' }}>
        S{r.markerSeason}E{r.markerEpisode}{r.markerMinute ? ` min${r.markerMinute}` : ''}
      </span>
    )
  }
  if (r.markerMinute) {
    return (
      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--c-surface)', color: 'var(--c-accent)' }}>
        {Math.floor(r.markerMinute / 60)}h{String(r.markerMinute % 60).padStart(2, '0')}
      </span>
    )
  }
  return null
}

interface FormState {
  body: string; moodTag: string
  markerMinute: string; markerSeason: string; markerEpisode: string
}

const EMPTY: FormState = { body: '', moodTag: '', markerMinute: '', markerSeason: '', markerEpisode: '' }

export default function ReactionTimeline({ entryId, isSeries, isOwner, isFriend }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const queryKey = ['timeline', entryId]

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)

  const canView = isOwner || !!isFriend

  const { data: reactions = [], isLoading } = useQuery<TimelineReaction[]>({
    queryKey,
    queryFn: () => api.get<TimelineReaction[]>(`/entries/${entryId}/timeline`),
    enabled: canView,
  })

  function startEdit(r: TimelineReaction) {
    setEditId(r.id)
    setShowForm(false)
    setForm({
      body: r.body,
      moodTag: r.moodTag ?? '',
      markerMinute: r.markerMinute?.toString() ?? '',
      markerSeason: r.markerSeason?.toString() ?? '',
      markerEpisode: r.markerEpisode?.toString() ?? '',
    })
  }

  async function save() {
    if (!form.body.trim()) return
    setSaving(true)
    try {
      const payload = {
        body: form.body.trim(),
        moodTag: form.moodTag.trim() || undefined,
        markerMinute: form.markerMinute ? parseInt(form.markerMinute) : undefined,
        markerSeason: form.markerSeason ? parseInt(form.markerSeason) : undefined,
        markerEpisode: form.markerEpisode ? parseInt(form.markerEpisode) : undefined,
      }
      if (editId) {
        await api.patch(`/entries/${entryId}/timeline/${editId}`, payload)
        setEditId(null)
      } else {
        await api.post(`/entries/${entryId}/timeline`, payload)
        setShowForm(false)
      }
      setForm(EMPTY)
      qc.invalidateQueries({ queryKey })
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await api.del(`/entries/${entryId}/timeline/${id}`)
    qc.invalidateQueries({ queryKey })
  }

  function cancel() {
    setShowForm(false); setEditId(null); setForm(EMPTY)
  }

  if (!canView) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} style={{ color: 'var(--c-accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Reaction timeline
          </span>
          {reactions.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
              {reactions.length}
            </span>
          )}
        </div>
        {isOwner && !showForm && !editId && (
          <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>
            <Plus size={13} />
            Add reaction
          </Button>
        )}
      </div>

      {/* Timeline entries */}
      {isLoading ? (
        <div className="h-16 flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reactions.length === 0 && !showForm ? (
        <p className="text-sm" style={{ color: 'var(--c-subtle)' }}>
          {isOwner ? 'No reactions yet. Add one!' : 'No reaction timeline.'}
        </p>
      ) : (
        <div className="relative flex flex-col gap-0">
          {/* Vertical line */}
          {reactions.length > 1 && (
            <div className="absolute left-4 top-4 bottom-4 w-0.5"
              style={{ background: 'var(--c-border)' }} />
          )}

          {reactions.map(r => (
            <div key={r.id}>
              {editId === r.id ? (
                <ReactionForm form={form} setForm={setForm} isSeries={isSeries}
                  onSave={save} onCancel={cancel} saving={saving} isEdit />
              ) : (
                <div className="flex gap-3 py-2.5 group">
                  {/* Dot */}
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-base z-10"
                    style={{ background: 'var(--c-surface)', border: '2px solid var(--c-border)' }}>
                    {r.moodTag && MOOD_PRESETS.includes(r.moodTag) ? r.moodTag : '💬'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {r.moodTag && !MOOD_PRESETS.includes(r.moodTag) && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--c-surface)', color: 'var(--c-accent)' }}>
                          {r.moodTag}
                        </span>
                      )}
                      <MarkerLabel r={r} />
                      <span className="text-xs ml-auto" style={{ color: 'var(--c-subtle)' }}>
                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>
                      {r.body}
                    </p>
                  </div>

                  {isOwner && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button onClick={() => startEdit(r)}
                        className="p-1 rounded transition" style={{ color: 'var(--c-muted)' }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => remove(r.id)}
                        className="p-1 rounded transition hover:text-red-500" style={{ color: 'var(--c-muted)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New reaction form */}
      {showForm && !editId && (
        <ReactionForm form={form} setForm={setForm} isSeries={isSeries}
          onSave={save} onCancel={cancel} saving={saving} />
      )}
    </div>
  )
}

function ReactionForm({ form, setForm, isSeries, onSave, onCancel, saving, isEdit }: {
  form: FormState; setForm: (f: FormState) => void
  isSeries: boolean; onSave: () => void; onCancel: () => void
  saving: boolean; isEdit?: boolean
}) {
  const PRESETS = ['😭', '😂', '🤯', '😱', '❤️', '🔥', '💔', '👏', '😤', '🥱']

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>

      {/* Mood presets */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs" style={{ color: 'var(--c-muted)' }}>Mood:</span>
        {PRESETS.map(e => (
          <button key={e} type="button"
            onClick={() => setForm({ ...form, moodTag: form.moodTag === e ? '' : e })}
            className={cn('w-8 h-8 rounded-lg text-base transition',
              form.moodTag === e ? 'ring-2 ring-[var(--c-accent)]' : 'hover:bg-[var(--c-card)]')}>
            {e}
          </button>
        ))}
        <input
          value={PRESETS.includes(form.moodTag) ? '' : form.moodTag}
          onChange={e => setForm({ ...form, moodTag: e.target.value })}
          placeholder="Custom tag"
          className="px-2 py-1 text-xs rounded-lg border focus:outline-none"
          style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)', color: 'var(--c-text)', width: 96 }}
        />
      </div>

      {/* Time marker */}
      <div className="flex gap-2 flex-wrap items-end">
        {isSeries ? (
          <>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs" style={{ color: 'var(--c-muted)' }}>Season</label>
              <input type="number" min={1} value={form.markerSeason}
                onChange={e => setForm({ ...form, markerSeason: e.target.value })}
                className="w-16 px-2 py-1 text-sm rounded-lg border focus:outline-none text-center"
                style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                placeholder="S" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs" style={{ color: 'var(--c-muted)' }}>Episode</label>
              <input type="number" min={1} value={form.markerEpisode}
                onChange={e => setForm({ ...form, markerEpisode: e.target.value })}
                className="w-16 px-2 py-1 text-sm rounded-lg border focus:outline-none text-center"
                style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                placeholder="E" />
            </div>
          </>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <label className="text-xs" style={{ color: 'var(--c-muted)' }}>Minute</label>
          <input type="number" min={0} value={form.markerMinute}
            onChange={e => setForm({ ...form, markerMinute: e.target.value })}
            className="w-20 px-2 py-1 text-sm rounded-lg border focus:outline-none text-center"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
            placeholder="min" />
        </div>
      </div>

      {/* Reaction text */}
      <textarea
        autoFocus
        value={form.body}
        onChange={e => setForm({ ...form, body: e.target.value })}
        placeholder="What were you thinking at this moment?"
        rows={2}
        className="w-full text-sm rounded-lg border px-3 py-2 resize-none focus:outline-none"
        style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave() }}
      />

      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} loading={saving} disabled={!form.body.trim()}>
          <Check size={13} />
          {isEdit ? 'Update' : 'Add reaction'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X size={13} />
          Cancel
        </Button>
      </div>
    </div>
  )
}
