import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useApi } from '@/lib/api'
import type { Comment } from '@/types'
import Button from './ui/Button'
import { MessageCircle, Trash2, CornerDownRight, Send } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  ownerId: string
  entryId?: string
  isFriend: boolean
  isOwner: boolean
}

// ── Single comment row ────────────────────────────────────────────────────────
function CommentRow({
  comment, isOwner, currentUserId, onReply, onDelete,
}: {
  comment: Comment
  isOwner: boolean
  currentUserId: string
  onReply: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isMe = comment.authorId === currentUserId
  const isOwnerComment = comment.authorId === comment.ownerId   // owner replied

  return (
    <div className={cn('flex flex-col gap-1', isOwnerComment && 'pl-6 border-l-2 border-[var(--c-accent)]')}>
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
          style={{ background: isOwnerComment ? 'var(--c-accent)' : 'var(--c-muted)' }}
        >
          {(comment.authorName ?? comment.authorUsername)[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
              {comment.authorName ?? comment.authorUsername}
              {isOwnerComment && (
                <span className="ml-1.5 text-xs font-normal px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--c-accent)', color: 'white', fontSize: 10 }}>
                  Owner
                </span>
              )}
            </span>
            <span className="text-xs" style={{ color: 'var(--c-subtle)' }}>
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm mt-0.5 leading-relaxed" style={{ color: 'var(--c-text)' }}>
            {comment.body}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-1 shrink-0">
          {isOwner && !isOwnerComment && (
            <button
              onClick={() => onReply(comment.id)}
              className="p-1 rounded transition text-xs flex items-center gap-1"
              style={{ color: 'var(--c-muted)' }}
              title="Reply"
            >
              <CornerDownRight size={13} />
            </button>
          )}
          {(isMe || isOwner) && (
            <button
              onClick={() => onDelete(comment.id)}
              className="p-1 rounded transition hover:text-red-500"
              style={{ color: 'var(--c-subtle)' }}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Thread (top-level comment + replies) ─────────────────────────────────────
function Thread({
  comment, isOwner, currentUserId, onReply, onDelete,
}: {
  comment: Comment
  isOwner: boolean
  currentUserId: string
  onReply: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div
      className="flex flex-col gap-2.5 p-3 rounded-xl border"
      style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
    >
      <CommentRow
        comment={comment}
        isOwner={isOwner}
        currentUserId={currentUserId}
        onReply={onReply}
        onDelete={onDelete}
      />
      {comment.replies?.map(reply => (
        <CommentRow
          key={reply.id}
          comment={reply}
          isOwner={isOwner}
          currentUserId={currentUserId}
          onReply={onReply}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ── Main CommentSection ───────────────────────────────────────────────────────
export default function CommentSection({ ownerId, entryId, isFriend, isOwner }: Props) {
  const { isSignedIn, userId: clerkId } = useAuth()
  const api = useApi()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const queryKey = ['comments', ownerId, entryId ?? 'portfolio']

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey,
    queryFn: () => api.get<Comment[]>(`/comments?ownerId=${ownerId}${entryId ? `&entryId=${entryId}` : ''}`),
    enabled: isSignedIn && (isFriend || isOwner),
  })

  // We need the DB user id — get it from the /me endpoint via cache
  const { data: me } = useQuery<{ id: string }>({
    queryKey: ['me'],
    enabled: !!isSignedIn,
  })
  const currentUserId = me?.id ?? ''

  if (!isSignedIn || (!isFriend && !isOwner)) {
    return (
      <div className="text-center py-6 text-sm" style={{ color: 'var(--c-subtle)' }}>
        <MessageCircle size={24} className="mx-auto mb-2 opacity-40" />
        Only friends can comment.
      </div>
    )
  }

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    try {
      await api.post('/comments', {
        ownerId,
        entryId: entryId ?? undefined,
        body: body.trim(),
        replyToId: replyToId ?? undefined,
      })
      setBody('')
      setReplyToId(null)
      qc.invalidateQueries({ queryKey })
    } finally {
      setPosting(false)
    }
  }

  async function deleteComment(id: string) {
    await api.del(`/comments/${id}`)
    qc.invalidateQueries({ queryKey })
  }

  function startReply(id: string) {
    setReplyToId(id)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={15} style={{ color: 'var(--c-accent)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          {isOwner ? 'Comments from friends' : 'My thread'}
        </span>
        {comments.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--c-surface)', color: 'var(--c-muted)' }}>
            {comments.length}
          </span>
        )}
      </div>

      {/* Thread list */}
      {isLoading ? (
        <div className="h-16 flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm py-3" style={{ color: 'var(--c-subtle)' }}>
          {isFriend ? 'No messages yet. Say something!' : 'No comments yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map(c => (
            <Thread
              key={c.id}
              comment={c}
              isOwner={isOwner}
              currentUserId={currentUserId}
              onReply={startReply}
              onDelete={deleteComment}
            />
          ))}
        </div>
      )}

      {/* Compose box */}
      {(isFriend || (isOwner && replyToId)) && (
        <div
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
          {replyToId && (
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--c-accent)' }}>Replying to comment</span>
              <button
                className="text-xs"
                style={{ color: 'var(--c-muted)' }}
                onClick={() => setReplyToId(null)}
              >
                Cancel
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={replyToId ? 'Write a reply…' : 'Write a comment…'}
            rows={2}
            className="w-full text-sm resize-none focus:outline-none bg-transparent"
            style={{ color: 'var(--c-text)' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post()
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--c-subtle)' }}>Ctrl+Enter to send</span>
            <Button size="sm" onClick={post} loading={posting} disabled={!body.trim()}>
              <Send size={13} />
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
