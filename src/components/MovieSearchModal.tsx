import { useState, useRef } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Input from './ui/Input'
import { useApi } from '@/lib/api'
import type { OmdbSearchResult, OmdbDetail } from '@/types'
import { Search, Film, PenLine } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (detail: OmdbDetail) => void
  onManual: () => void
}

export default function MovieSearchModal({ open, onClose, onSelect, onManual }: Props) {
  const api = useApi()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<OmdbSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [fetching, setFetching] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setError('')
    try {
      const res = await api.get<{ results: OmdbSearchResult[] }>(`/omdb/search?q=${encodeURIComponent(q)}`)
      setResults(res.results)
      if (res.results.length === 0) setError('No results found. Try a different title.')
    } catch {
      setError('Search failed — check your connection.')
    } finally {
      setSearching(false)
    }
  }

  async function pick(imdbId: string) {
    setFetching(imdbId)
    try {
      const detail = await api.get<OmdbDetail>(`/omdb/${imdbId}`)
      onSelect(detail)
    } catch {
      setError('Failed to load details.')
    } finally {
      setFetching(null)
    }
  }

  function handleClose() {
    setQ(''); setResults([]); setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Search for a Title" size="lg">
      <div className="flex flex-col gap-4">
        {/* Search bar */}
        <form onSubmit={search} className="flex gap-2">
          <div className="flex-1">
            <Input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Type a movie or show title…"
              autoFocus
            />
          </div>
          <Button type="submit" loading={searching} size="md">
            <Search size={16} />
          </Button>
        </form>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Results */}
        {results.length > 0 && (
          <ul className="flex flex-col divide-y divide-[var(--c-border)]">
            {results.map(r => (
              <li key={r.imdbId}>
                <button
                  className="w-full flex items-center gap-3 py-3 hover:bg-[var(--c-surface)] px-2 rounded-lg transition text-left"
                  onClick={() => pick(r.imdbId)}
                  disabled={!!fetching}
                >
                  {/* Poster thumbnail */}
                  <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-[var(--c-surface)] flex items-center justify-center">
                    {r.posterUrl
                      ? <img src={r.posterUrl} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                      : <Film size={16} className="text-[var(--c-subtle)]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[var(--c-text)] truncate">{r.title}</p>
                    <p className="text-xs text-[var(--c-muted)]">{r.year} · {r.type}</p>
                  </div>
                  {fetching === r.imdbId && (
                    <span className="w-4 h-4 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Manual entry fallback */}
        <div className="pt-2 border-t border-[var(--c-border)] flex items-center justify-between">
          <p className="text-xs text-[var(--c-muted)]">Title not found in the results?</p>
          <Button variant="ghost" size="sm" onClick={() => { handleClose(); onManual() }}>
            <PenLine size={14} />
            Add manually
          </Button>
        </div>
      </div>
    </Modal>
  )
}
