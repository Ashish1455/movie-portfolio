import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import { publicGet } from '@/lib/api'
import type { CollectionStats } from '@/types'
import { BarChart2, EyeOff } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

const CATEGORY_COLORS: Record<string, string> = {
  movie:        '#3B82F6',
  tv_series:    '#8B5CF6',
  anime:        '#EC4899',
  documentary:  '#10B981',
}

const CATEGORY_LABELS: Record<string, string> = {
  movie: 'Movies', tv_series: 'TV Series', anime: 'Anime', documentary: 'Documentaries',
}

function DonutChart({ data }: { data: { key: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const cx = 70; const cy = 70; const r = 50; const strokeWidth = 20
  let cumulative = 0

  function polar(angle: number, radius: number) {
    const rad = (angle - 90) * (Math.PI / 180)
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  function arc(start: number, end: number) {
    // Avoid full-circle bug: cap at 359.99
    const e = end >= 360 ? 359.99 : end
    const s = polar(start, r); const en = polar(e, r)
    const large = e - start > 180 ? 1 : 0
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${en.x.toFixed(2)} ${en.y.toFixed(2)}`
  }

  return (
    <svg viewBox="0 0 140 140" className="w-full max-w-[140px]" aria-hidden="true">
      {data.map(d => {
        const startAngle = (cumulative / total) * 360
        cumulative += d.value
        const endAngle = (cumulative / total) * 360
        return (
          <path
            key={d.key}
            d={arc(startAngle, endAngle)}
            fill="none"
            stroke={d.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        )
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={20} fontWeight="700"
        fill="var(--c-text)">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10}
        fill="var(--c-muted)">titles</text>
    </svg>
  )
}

interface Props {
  username?: string   // public view; omit for own dashboard
  isOwner?: boolean
}

export default function CollectionPieChart({ username, isOwner }: Props) {
  const api = useApi()
  const qc = useQueryClient()

  const queryKey = username ? ['stats', username] : ['stats', 'me']

  const { data: stats, isLoading } = useQuery<CollectionStats>({
    queryKey,
    queryFn: () =>
      username
        ? publicGet<CollectionStats>(`/u/${username}/stats`)
        : api.get<CollectionStats>('/stats'),
  })

  async function toggleChart(show: boolean) {
    await api.patch('/me/settings', { showStatsChart: show })
    qc.invalidateQueries({ queryKey: ['stats', 'me'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  if (isLoading || !stats) return null
  if (!stats.showStatsChart && !isOwner) return null
  if (stats.total === 0) return null

  const chartData = Object.entries(stats.byCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, value: v, color: CATEGORY_COLORS[k] ?? '#6B7280' }))

  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} style={{ color: 'var(--c-accent)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
            Collection at a glance
          </span>
        </div>
        {isOwner && (
          <button
            onClick={() => toggleChart(!stats.showStatsChart)}
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--c-muted)' }}
          >
            <EyeOff size={12} />
            {stats.showStatsChart ? 'Hide chart' : 'Show chart'}
          </button>
        )}
      </div>

      {stats.showStatsChart ? (
        <div className="flex items-center gap-6 flex-wrap">
          {/* Donut */}
          <div className="shrink-0">
            <DonutChart data={chartData} />
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {chartData.map(d => (
              <div key={d.key} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-sm" style={{ color: 'var(--c-text)' }}>
                  {CATEGORY_LABELS[d.key] ?? d.key}
                </span>
                <span className="ml-auto text-sm font-semibold" style={{ color: 'var(--c-muted)' }}>
                  {d.value}
                </span>
                <span className="text-xs w-10 text-right" style={{ color: 'var(--c-subtle)' }}>
                  {Math.round((d.value / stats.total) * 100)}%
                </span>
              </div>
            ))}

            {/* Summary stats */}
            <div className="border-t pt-2 mt-1 grid grid-cols-2 gap-2"
              style={{ borderColor: 'var(--c-border)' }}>
              {stats.avgRating !== null && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--c-subtle)' }}>Avg rating</p>
                  <p className="text-base font-bold" style={{ color: 'var(--c-accent)' }}>
                    {stats.avgRating}
                  </p>
                </div>
              )}
              {stats.withReview > 0 && (
                <div>
                  <p className="text-xs" style={{ color: 'var(--c-subtle)' }}>With review</p>
                  <p className="text-base font-bold" style={{ color: 'var(--c-accent)' }}>
                    {stats.withReview}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Stats-only view when chart is hidden */
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Avg rating', value: stats.avgRating ?? '—' },
            { label: 'Reviewed', value: stats.withReview },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold" style={{ color: 'var(--c-accent)' }}>{s.value}</p>
              <p className="text-xs" style={{ color: 'var(--c-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
