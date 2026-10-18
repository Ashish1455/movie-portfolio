import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { ReportReason } from '@/types'
import Button from './ui/Button'
import { MoreHorizontal, Ban, Flag, X } from 'lucide-react'

interface Props {
  targetUserId: string
  targetUsername: string
  isBlocked?: boolean
  blockId?: string
}

const REASON_OPTS: { value: ReportReason; label: string }[] = [
  { value: 'spam',                  label: 'Spam' },
  { value: 'harassment',            label: 'Harassment' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'other',                 label: 'Other' },
]

export default function BlockReportButton({ targetUserId, targetUsername, isBlocked, blockId }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [showReport,  setShowReport]  = useState(false)
  const [showBlock,   setShowBlock]   = useState(false)
  const [reason,      setReason]      = useState<ReportReason>('spam')
  const [details,     setDetails]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [done,        setDone]        = useState('')

  async function block() {
    setLoading(true)
    try {
      await api.post(`/block/${targetUsername}`)
      qc.invalidateQueries({ queryKey: ['public-user', targetUsername] })
      qc.invalidateQueries({ queryKey: ['block'] })
      setDone('User blocked. Their profile is now hidden from you.')
      setShowBlock(false)
      setMenuOpen(false)
    } finally { setLoading(false) }
  }

  async function unblock() {
    if (!blockId) return
    setLoading(true)
    try {
      await api.del(`/block/${blockId}`)
      qc.invalidateQueries({ queryKey: ['public-user', targetUsername] })
      qc.invalidateQueries({ queryKey: ['block'] })
      setDone('User unblocked.')
      setMenuOpen(false)
    } finally { setLoading(false) }
  }

  async function report() {
    setLoading(true)
    try {
      await api.post('/report', { targetUserId, reason, details: details.trim() || undefined })
      setDone('Report submitted. Thank you.')
      setShowReport(false)
      setMenuOpen(false)
    } finally { setLoading(false) }
  }

  if (done) {
    return (
      <p className="text-xs px-2 py-1 rounded-lg"
        style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
        {done}
      </p>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(v => !v)}
        className="p-2 rounded-lg transition"
        style={{ color: 'var(--c-muted)' }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--c-surface)')}
        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        title="More options"
      >
        <MoreHorizontal size={16} />
      </button>

      {menuOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 z-40 rounded-xl border shadow-lg py-1 min-w-40"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
            {isBlocked ? (
              <button
                onClick={unblock}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition hover:bg-[var(--c-surface)]"
                style={{ color: 'var(--c-text)' }}
              >
                <Ban size={14} />
                Unblock @{targetUsername}
              </button>
            ) : (
              <button
                onClick={() => { setShowBlock(true); setMenuOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition hover:bg-[var(--c-surface)]"
                style={{ color: '#ef4444' }}
              >
                <Ban size={14} />
                Block @{targetUsername}
              </button>
            )}
            <button
              onClick={() => { setShowReport(true); setMenuOpen(false) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition hover:bg-[var(--c-surface)]"
              style={{ color: 'var(--c-text)' }}
            >
              <Flag size={14} />
              Report
            </button>
          </div>
        </>
      )}

      {/* Block confirm */}
      {showBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="rounded-xl border p-6 max-w-sm w-full shadow-2xl"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                Block @{targetUsername}?
              </h3>
              <button onClick={() => setShowBlock(false)} style={{ color: 'var(--c-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--c-muted)' }}>
              They won't be able to see your profile or comment on your portfolio.
              Any existing friendship will also be removed.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowBlock(false)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={block} loading={loading}>Block</Button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="rounded-xl border p-6 max-w-sm w-full shadow-2xl"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                Report @{targetUsername}
              </h3>
              <button onClick={() => setShowReport(false)} style={{ color: 'var(--c-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-muted)' }}>
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value as ReportReason)}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                  style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                >
                  {REASON_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--c-muted)' }}>
                  Details (optional)
                </label>
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  rows={3}
                  placeholder="Tell us more…"
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
                  style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowReport(false)}>Cancel</Button>
                <Button size="sm" onClick={report} loading={loading}>Submit report</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
