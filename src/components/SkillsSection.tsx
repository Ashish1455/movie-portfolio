import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/api'
import { publicGet } from '@/lib/api'
import type { Skill } from '@/types'
import { Plus, X, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  username: string
  isOwner?: boolean
}

export default function SkillsSection({ username, isOwner }: Props) {
  const api = useApi()
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const queryKey = ['skills', username]

  const { data: skills = [], isLoading } = useQuery<Skill[]>({
    queryKey,
    queryFn: () =>
      isOwner
        ? api.get<Skill[]>('/skills')
        : publicGet<Skill[]>(`/u/${username}/skills`),
  })

  async function addSkill() {
    const trimmed = input.trim()
    if (!trimmed) return
    if (trimmed.length > 60) { setError('Max 60 characters'); return }
    setError('')
    try {
      await api.post('/skills', { skill: trimmed })
      setInput('')
      qc.invalidateQueries({ queryKey })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    }
  }

  async function removeSkill(id: string) {
    await api.del(`/skills/${id}`)
    qc.invalidateQueries({ queryKey })
  }

  if (isLoading) return null
  if (!isOwner && skills.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tag size={15} style={{ color: 'var(--c-accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Skills & interests</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {skills.map(s => (
          <span
            key={s.id}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border',
            )}
            style={{
              background: 'var(--c-surface)',
              borderColor: 'var(--c-border)',
              color: 'var(--c-text)',
            }}
          >
            {s.skill}
            {isOwner && (
              <button
                onClick={() => removeSkill(s.id)}
                className="ml-1 opacity-50 hover:opacity-100 transition"
                aria-label={`Remove ${s.skill}`}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}

        {/* Add new skill (owner only) */}
        {isOwner && (
          adding ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                autoFocus
                value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') addSkill()
                  if (e.key === 'Escape') { setAdding(false); setInput('') }
                }}
                placeholder="e.g. mostly anime"
                maxLength={60}
                className="px-2 py-1 text-sm rounded-full border focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--c-surface)',
                  borderColor: 'var(--c-accent)',
                  color: 'var(--c-text)',
                  width: 160,
                }}
              />
              <button
                onClick={addSkill}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white"
                style={{ background: 'var(--c-accent)' }}
              >
                <Plus size={12} />
              </button>
              <button
                onClick={() => { setAdding(false); setInput(''); setError('') }}
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50) }}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm border-2 border-dashed transition"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
            >
              <Plus size={12} />
              Add skill
            </button>
          )
        )}
      </div>

      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

      {isOwner && (
        <p className="text-xs" style={{ color: 'var(--c-subtle)' }}>
          {skills.length}/30 · Press Enter to add · Esc to cancel
        </p>
      )}
    </div>
  )
}
