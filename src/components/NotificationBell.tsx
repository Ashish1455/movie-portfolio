import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import type { Notification } from '@/types'
import { Bell, UserPlus, UserCheck, MessageCircle, CornerDownRight, CheckCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<string, React.ElementType> = {
  friend_request:  UserPlus,
  friend_accepted: UserCheck,
  new_comment:     MessageCircle,
  new_reply:       CornerDownRight,
}

export default function NotificationBell() {
  const api = useApi()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    refetchInterval: 30_000,   // poll every 30 s
  })

  const unread = notifications.filter(n => !n.read).length

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function markAll() {
    await api.post('/notifications/read-all')
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function markOne(id: string) {
    await api.patch(`/notifications/${id}/read`)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg transition"
        style={{ color: 'var(--c-muted)' }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--c-surface)')}
        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-4 h-4 rounded-full text-white text-xs font-bold flex items-center justify-center px-1"
            style={{ background: 'var(--c-accent)', fontSize: 10 }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-2xl overflow-hidden"
          style={{
            background: 'var(--c-card)',
            borderColor: 'var(--c-border)',
            width: 320,
            maxHeight: 440,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--c-border)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Notifications {unread > 0 && <span style={{ color: 'var(--c-accent)' }}>({unread})</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--c-accent)' }}
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--c-subtle)' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICON[n.type] ?? Bell
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markOne(n.id)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 border-b cursor-pointer transition',
                      !n.read && 'cursor-pointer',
                    )}
                    style={{
                      borderColor: 'var(--c-border)',
                      background: n.read ? 'transparent' : 'var(--c-surface)',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--c-surface)')}
                    onMouseOut={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'var(--c-surface)')}
                  >
                    <div
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: 'var(--c-accent)', color: 'white' }}
                    >
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: 'var(--c-text)' }}>
                        {n.message}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--c-subtle)' }}>
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <div
                        className="w-2 h-2 rounded-full mt-2 shrink-0"
                        style={{ background: 'var(--c-accent)' }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
