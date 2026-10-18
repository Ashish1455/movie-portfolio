import { useState } from 'react'
import { useApi } from '@/lib/api'
import type { ExternalLink, ExternalSite } from '@/types'
import Button from './ui/Button'
import Input from './ui/Input'
import { detectSite, siteLabel } from '@/lib/utils'
import { ExternalLink as ExtIcon, Trash2, Plus } from 'lucide-react'

interface Props {
  entryId: string
  links: ExternalLink[]
  onChange: () => void
  readOnly?: boolean
}

const ALL_SITES: ExternalSite[] = ['imdb', 'letterboxd', 'rotten_tomatoes']

export default function ExternalLinksPanel({ entryId, links, onChange, readOnly }: Props) {
  const api = useApi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<ExternalSite, string>>({
    imdb: links.find(l => l.site === 'imdb')?.url ?? '',
    letterboxd: links.find(l => l.site === 'letterboxd')?.url ?? '',
    rotten_tomatoes: links.find(l => l.site === 'rotten_tomatoes')?.url ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const toSave: { site: ExternalSite; url: string }[] = []
    for (const site of ALL_SITES) {
      const url = draft[site].trim()
      if (!url) continue
      const detected = detectSite(url)
      if (!detected) { setError(`Invalid URL: ${url}`); return }
      toSave.push({ site: detected as ExternalSite, url })
    }
    setSaving(true)
    setError('')
    try {
      await api.put(`/entries/${entryId}/links`, { links: toSave })
      setEditing(false)
      onChange()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (readOnly) {
    if (links.length === 0) return null
    return (
      <div className="flex flex-wrap gap-2">
        {links.map(l => (
          <a
            key={l.site}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--c-accent)] hover:underline"
          >
            <ExtIcon size={12} />
            {siteLabel(l.site)}
          </a>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {!editing ? (
        <div className="flex flex-col gap-2">
          {links.length === 0
            ? <p className="text-sm text-[var(--c-subtle)]">No external links added.</p>
            : links.map(l => (
              <div key={l.site} className="flex items-center gap-2 text-sm">
                <ExtIcon size={13} className="text-[var(--c-muted)]" />
                <span className="text-[var(--c-muted)] w-28 shrink-0">{siteLabel(l.site)}</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--c-accent)] hover:underline truncate flex-1"
                >
                  {l.url}
                </a>
              </div>
            ))
          }
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setDraft({
                imdb: links.find(l => l.site === 'imdb')?.url ?? '',
                letterboxd: links.find(l => l.site === 'letterboxd')?.url ?? '',
                rotten_tomatoes: links.find(l => l.site === 'rotten_tomatoes')?.url ?? '',
              })
              setEditing(true)
            }}
          >
            <Plus size={14} />
            {links.length > 0 ? 'Edit links' : 'Add links'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border border-[var(--c-border)] rounded-lg p-3 bg-[var(--c-surface)]">
          <Input
            label="IMDb URL"
            placeholder="https://www.imdb.com/title/tt..."
            value={draft.imdb}
            onChange={e => setDraft(d => ({ ...d, imdb: e.target.value }))}
          />
          <Input
            label="Letterboxd URL"
            placeholder="https://letterboxd.com/film/..."
            value={draft.letterboxd}
            onChange={e => setDraft(d => ({ ...d, letterboxd: e.target.value }))}
          />
          <Input
            label="Rotten Tomatoes URL"
            placeholder="https://www.rottentomatoes.com/m/..."
            value={draft.rotten_tomatoes}
            onChange={e => setDraft(d => ({ ...d, rotten_tomatoes: e.target.value }))}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={save}>Save links</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
