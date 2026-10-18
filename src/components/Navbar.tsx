import { Link } from 'react-router-dom'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { User } from '@/types'
import { Film, LogOut, Settings, ExternalLink } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { useState } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Select from './ui/Select'

interface SettingsModalProps { me: User; onClose: () => void }

function SettingsModal({ me, onClose }: SettingsModalProps) {
  const api = useApi()
  const { signOut } = useClerk()
  const [theme, setTheme]                 = useState(me.theme)
  const [visibility, setVisibility]       = useState(me.visibility)
  const [preferredName, setPreferredName] = useState(me.preferredName ?? '')
  const [showChart, setShowChart]         = useState(me.showStatsChart ?? true)
  const [saving, setSaving]               = useState(false)
  const [exporting, setExporting]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting]           = useState(false)
  const [showDanger, setShowDanger]       = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.patch('/me/settings', { theme, visibility, preferredName, showStatsChart: showChart })
      onClose()
      window.location.reload()
    } finally { setSaving(false) }
  }

  async function exportData() {
    setExporting(true)
    try {
      const data = await api.get('/me/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `moviefolio-export-${new Date().toISOString().slice(0, 10)}.json`,
      })
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  async function deleteAccount() {
    if (deleteConfirm !== me.username) return
    setDeleting(true)
    try {
      await api.del('/me')
      await signOut()
    } finally { setDeleting(false) }
  }

  return (
    <Modal open onClose={onClose} title="Settings" size="sm">
      <div className="flex flex-col gap-4">
        {/* Display name */}
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: 'var(--c-muted)' }}>
            Display name
          </label>
          <input
            value={preferredName}
            onChange={e => setPreferredName(e.target.value)}
            placeholder="How your name appears to visitors"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)' }}
          />
        </div>

        <Select label="Theme" value={theme}
          onChange={e => setTheme(e.target.value as User['theme'])}
          options={[
            { value: 'minimal',        label: 'Minimal' },
            { value: 'cinematic_dark', label: 'Cinematic Dark' },
            { value: 'poster_grid',    label: 'Poster Grid' },
          ]}
        />

        <Select label="Profile visibility" value={visibility}
          onChange={e => setVisibility(e.target.value as User['visibility'])}
          options={[
            { value: 'public',       label: 'Public — anyone can see your portfolio' },
            { value: 'friends_only', label: 'Friends only — only accepted friends can see it' },
            { value: 'private',      label: 'Private — only you can see it' },
          ]}
        />

        {/* Stats chart toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showChart}
            onChange={e => setShowChart(e.target.checked)}
            className="w-4 h-4"
            style={{ accentColor: 'var(--c-accent)' }}
          />
          <span className="text-sm" style={{ color: 'var(--c-text)' }}>
            Show collection stats chart on my profile
          </span>
        </label>

        <div className="text-xs border-t pt-3"
          style={{ color: 'var(--c-subtle)', borderColor: 'var(--c-border)' }}>
          Public link: <span className="font-medium" style={{ color: 'var(--c-accent)' }}>/u/{me.username}</span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
        </div>

        {/* Data & account */}
        <div className="border-t pt-4 flex flex-col gap-3"
          style={{ borderColor: 'var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--c-muted)' }}>Data & account</p>

          <Button variant="outline" size="sm" onClick={exportData}
            loading={exporting} className="self-start">
            Export my data (.json)
          </Button>

          <button
            onClick={() => setShowDanger(v => !v)}
            className="text-sm text-red-500 hover:underline self-start"
          >
            {showDanger ? '▲ Hide' : '▼ Delete account'}
          </button>

          {showDanger && (
            <div className="rounded-xl border border-red-300 p-4 flex flex-col gap-3"
              style={{ background: '#fff1f2' }}>
              <p className="text-sm font-semibold text-red-700">
                This is permanent and cannot be undone.
              </p>
              <p className="text-xs text-red-600">
                All your entries, ratings, reviews, friends, and account data will be deleted.
              </p>
              <div>
                <label className="text-xs text-red-600 block mb-1">
                  Type your username <strong>{me.username}</strong> to confirm
                </label>
                <input
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={me.username ?? ''}
                  className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm text-red-900 bg-white"
                />
              </div>
              <Button variant="danger" size="sm" onClick={deleteAccount}
                loading={deleting} disabled={deleteConfirm !== me.username}
                className="self-start">
                Delete my account
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function Navbar() {
  const api = useApi()
  const { signOut } = useClerk()
  const [showSettings, setShowSettings] = useState(false)

  const { data: me } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/me'),
  })

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[var(--c-border)]"
        style={{ background: 'var(--c-bg)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-[var(--c-text)]">
            <Film size={20} style={{ color: 'var(--c-accent)' }} />
            <span className="hidden sm:inline">MovieFolio</span>
          </Link>

          <div className="flex items-center gap-1">
            {me?.username && (
              <Link to={`/u/${me.username}`} target="_blank"
                className="p-2 rounded-lg hover:bg-[var(--c-surface)] text-[var(--c-muted)] transition"
                title="View public profile">
                <ExternalLink size={16} />
              </Link>
            )}
            <NotificationBell />
            <button onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-[var(--c-surface)] text-[var(--c-muted)] transition"
              title="Settings">
              <Settings size={16} />
            </button>
            <button onClick={() => signOut()}
              className="p-2 rounded-lg hover:bg-[var(--c-surface)] text-[var(--c-muted)] transition"
              title="Sign out">
              <LogOut size={16} />
            </button>
            <div className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center ml-1"
              style={{ background: 'var(--c-accent)' }}>
              {(me?.preferredName ?? me?.username ?? '?')[0].toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {showSettings && me && (
        <SettingsModal me={me} onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
