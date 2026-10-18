import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useApi } from '@/lib/api'
import type { FriendshipStatus } from '@/types'
import Button from './ui/Button'
import { UserPlus, UserCheck, UserX, Clock, ChevronDown } from 'lucide-react'

interface Props {
  ownerId: string
  ownerUsername: string
  initialStatus: FriendshipStatus
}

export default function FriendButton({ ownerId, ownerUsername, initialStatus }: Props) {
  const { isSignedIn } = useAuth()
  const api = useApi()
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<FriendshipStatus>(initialStatus)
  const [showConfirm, setShowConfirm] = useState(false)

  if (!isSignedIn) {
    return (
      <a
        href="/sign-in"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
        style={{ background: 'var(--c-accent)' }}
      >
        <UserPlus size={15} />
        Sign in to connect
      </a>
    )
  }

  if (status.status === 'self') return null

  async function sendRequest() {
    setLoading(true)
    try {
      const res = await api.post<{ friendshipId: string; status: string }>(
        `/friends/request/${ownerUsername}`
      )
      setStatus({ status: 'pending_sent', friendshipId: res.friendshipId })
      qc.invalidateQueries({ queryKey: ['friends'] })
    } finally {
      setLoading(false)
    }
  }

  async function accept() {
    if (status.status !== 'pending_received') return
    setLoading(true)
    try {
      await api.post(`/friends/accept/${status.friendshipId}`)
      setStatus({ status: 'friends', friendshipId: status.friendshipId })
      qc.invalidateQueries({ queryKey: ['friends'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    if (status.status === 'none' || status.status === 'self') return
    setLoading(true)
    try {
      await api.del(`/friends/${status.friendshipId}`)
      setStatus({ status: 'none' })
      setShowConfirm(false)
      qc.invalidateQueries({ queryKey: ['friends'] })
      qc.invalidateQueries({ queryKey: ['public-user', ownerUsername] })
    } finally {
      setLoading(false)
    }
  }

  if (status.status === 'none') {
    return (
      <Button onClick={sendRequest} loading={loading} size="sm">
        <UserPlus size={14} />
        Send friend request
      </Button>
    )
  }

  if (status.status === 'pending_sent') {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--c-muted)]">
          <Clock size={14} />
          Request sent
        </span>
        <Button variant="ghost" size="sm" onClick={remove} loading={loading}>
          <UserX size={13} />
          Cancel
        </Button>
      </div>
    )
  }

  if (status.status === 'pending_received') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--c-muted)]">Sent you a request</span>
        <Button size="sm" onClick={accept} loading={loading}>
          <UserCheck size={13} />
          Accept
        </Button>
        <Button variant="ghost" size="sm" onClick={remove} loading={loading}>
          Decline
        </Button>
      </div>
    )
  }

  // friends
  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowConfirm(v => !v)}
      >
        <UserCheck size={13} className="text-green-600" />
        Friends
        <ChevronDown size={12} />
      </Button>

      {showConfirm && (
        <div
          className="absolute right-0 top-full mt-1 z-20 rounded-lg border shadow-lg p-3 min-w-40"
          style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}
        >
          <p className="text-xs text-[var(--c-muted)] mb-2">Remove from friends?</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={remove} loading={loading}>
              Unfriend
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
