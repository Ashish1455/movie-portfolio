import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { User, PortfolioEntry, Top12Item } from '@/types'
import Navbar from '@/components/Navbar'
import ThemeWrapper from '@/components/ThemeWrapper'
import Top12Grid from '@/components/Top12Grid'
import CollectionView from '@/components/CollectionView'
import MovieSearchModal from '@/components/MovieSearchModal'
import AddEditEntryModal from '@/components/AddEditEntryModal'
import type { OmdbDetail } from '@/types'
import SkillsSection from '@/components/SkillsSection'
import CollectionPieChart from '@/components/CollectionPieChart'
import Button from '@/components/ui/Button'
import { Plus, Film, Trophy } from 'lucide-react'

type AddStep = 'search' | 'form' | 'manual' | null

export default function Dashboard() {
  const api = useApi()
  const qc = useQueryClient()

  const [addStep, setAddStep] = useState<AddStep>(null)
  const [omdbDetail, setOmdbDetail] = useState<OmdbDetail | null>(null)

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: me } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/me'),
  })

  const { data: entries = [], refetch: refetchEntries } = useQuery<PortfolioEntry[]>({
    queryKey: ['entries'],
    queryFn: () => api.get<PortfolioEntry[]>('/entries'),
  })

  const { data: top12 = [], refetch: refetchTop12 } = useQuery<Top12Item[]>({
    queryKey: ['top12'],
    queryFn: () => api.get<Top12Item[]>('/top12'),
  })

  function invalidateAll() {
    refetchEntries()
    refetchTop12()
    qc.invalidateQueries({ queryKey: ['entry'] })
  }

  // ── Add-entry flow ────────────────────────────────────────────────────────
  function startAdd() { setOmdbDetail(null); setAddStep('search') }

  function onOmdbSelect(detail: OmdbDetail) {
    setOmdbDetail(detail)
    setAddStep('form')
  }

  function closeAdd() {
    setAddStep(null)
    setOmdbDetail(null)
  }

  if (!me) return null

  return (
    <ThemeWrapper theme={me.theme}>
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-10">

        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>
              {me.preferredName ?? me.username}'s portfolio
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--c-muted)' }}>
              {entries.length} {entries.length === 1 ? 'title' : 'titles'} in collection
            </p>
          </div>
          <Button onClick={startAdd} size="md">
            <Plus size={16} />
            Add title
          </Button>
        </div>

        {/* ── SKILLS ─────────────────────────────────────────────────────── */}
        {me.username && (
          <section>
            <SkillsSection username={me.username} isOwner />
          </section>
        )}

        {/* ── STATS CHART ────────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <CollectionPieChart isOwner />
        )}

        {/* ── TOP 12 ─────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} style={{ color: 'var(--c-accent)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Top 12</h2>
            <span className="text-xs ml-1" style={{ color: 'var(--c-muted)' }}>
              {top12.length}/12 · drag to reorder
            </span>
          </div>

          {entries.length === 0 ? (
            <div
              className="rounded-xl border-2 border-dashed py-12 text-center"
              style={{ borderColor: 'var(--c-border)' }}
            >
              <Film size={36} className="mx-auto mb-3" style={{ color: 'var(--c-subtle)' }} />
              <p className="text-sm mb-3" style={{ color: 'var(--c-muted)' }}>
                Add titles to your collection first, then build your Top 12.
              </p>
              <Button onClick={startAdd} size="sm">
                <Plus size={14} />
                Add your first title
              </Button>
            </div>
          ) : (
            <Top12Grid
              items={top12}
              allEntries={entries}
              onUpdate={invalidateAll}
            />
          )}
        </section>

        {/* ── COLLECTION ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Film size={18} style={{ color: 'var(--c-accent)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Collection</h2>
          </div>

          <CollectionView
            entries={entries}
            onRefetch={invalidateAll}
          />
        </section>
      </main>

      {/* ── Floating add button (mobile) ──────────────────────────────────── */}
      <button
        onClick={startAdd}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg text-white flex items-center justify-center sm:hidden z-30 transition hover:scale-105"
        style={{ background: 'var(--c-accent)' }}
        aria-label="Add title"
      >
        <Plus size={24} />
      </button>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <MovieSearchModal
        open={addStep === 'search'}
        onClose={closeAdd}
        onSelect={onOmdbSelect}
        onManual={() => setAddStep('manual')}
      />

      <AddEditEntryModal
        open={addStep === 'form' || addStep === 'manual'}
        onClose={closeAdd}
        onSaved={invalidateAll}
        prefill={addStep === 'form' ? omdbDetail : null}
        isManual={addStep === 'manual'}
      />
    </ThemeWrapper>
  )
}
