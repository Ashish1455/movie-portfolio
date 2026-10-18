import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@clerk/clerk-react'
import { useApi, publicGet } from '@/lib/api'
import type { PublicUserWithFriendship, Top12Item, PortfolioEntry } from '@/types'
import ThemeWrapper from '@/components/ThemeWrapper'
import Top12Grid from '@/components/Top12Grid'
import CollectionView from '@/components/CollectionView'
import FriendButton from '@/components/FriendButton'
import CommentSection from '@/components/CommentSection'
import SkillsSection from '@/components/SkillsSection'
import CollectionPieChart from '@/components/CollectionPieChart'
import BlockReportButton from '@/components/BlockReportButton'
import { Film, Lock, Trophy, LayoutGrid, MessageCircle } from 'lucide-react'
import { useState } from 'react'

function Spinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <div className="w-8 h-8 rounded-full border-2 border-[var(--c-border)] border-t-[var(--c-accent)] animate-spin" />
    </div>
  )
}

export default function Profile() {
  const { username } = useParams<{ username: string }>()
  const { isSignedIn } = useAuth()
  const api = useApi()
  const [showComments, setShowComments] = useState(false)

  const { data: user, isLoading: userLoading, isError } = useQuery<PublicUserWithFriendship>({
    queryKey: ['public-user', username],
    queryFn: () =>
      isSignedIn
        ? api.get<PublicUserWithFriendship>(`/u/${username}`)
        : publicGet<PublicUserWithFriendship>(`/u/${username}`),
    retry: false,
  })

  const isFriend = user?.friendshipStatus?.status === 'friends'
  const isOwner  = user?.friendshipStatus?.status === 'self'
  const canView  = user?.canView ?? false

  const { data: top12 = [], isLoading: top12Loading } = useQuery<Top12Item[]>({
    queryKey: ['public-top12', username],
    queryFn: () =>
      isSignedIn
        ? api.get<Top12Item[]>(`/u/${username}/top12`)
        : publicGet<Top12Item[]>(`/u/${username}/top12`),
    enabled: !!user && canView,
  })

  const { data: entries = [], isLoading: collectionLoading } = useQuery<PortfolioEntry[]>({
    queryKey: ['public-collection', username],
    queryFn: () =>
      isSignedIn
        ? api.get<PortfolioEntry[]>(`/u/${username}/collection`)
        : publicGet<PortfolioEntry[]>(`/u/${username}/collection`),
    enabled: !!user && canView,
  })

  if (userLoading) return <Spinner />

  if (isError || !user) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4"
        style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
        <Film size={40} style={{ color: 'var(--c-subtle)' }} />
        <h1 className="text-xl font-semibold">Profile not found</h1>
        <p style={{ color: 'var(--c-muted)' }}>There's no user at /u/{username}</p>
        <Link to="/" className="text-sm font-medium" style={{ color: 'var(--c-accent)' }}>← Home</Link>
      </div>
    )
  }

  const showPrivacyWall = !canView && !isOwner

  return (
    <ThemeWrapper theme={user.theme}>
      {/* Site nav */}
      <header className="sticky top-0 z-40 border-b"
        style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)' }}>
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-sm"
            style={{ color: 'var(--c-text)' }}>
            <Film size={18} style={{ color: 'var(--c-accent)' }} />
            MovieFolio
          </Link>
          {!isSignedIn && (
            <Link to="/sign-in"
              className="text-sm font-medium px-3 py-1.5 rounded-lg border transition"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 flex flex-col gap-10">

        {/* Profile header */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: 'var(--c-accent)' }}>
            {(user.preferredName ?? user.username)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold"
              style={{ color: 'var(--c-text)', fontFamily: 'var(--font-display)' }}>
              {user.preferredName ?? user.username}
            </h1>
            <p className="text-sm" style={{ color: 'var(--c-muted)' }}>@{user.username}</p>
          </div>

          <div className="flex items-center gap-2">
            {!isOwner && user.friendshipStatus && (
              <FriendButton
                ownerId={user.id}
                ownerUsername={user.username}
                initialStatus={user.friendshipStatus}
              />
            )}
            {/* Block/Report — only for signed-in non-owners */}
            {isSignedIn && !isOwner && (
              <BlockReportButton
                targetUserId={user.id}
                targetUsername={user.username}
              />
            )}
          </div>
        </div>

        {/* Privacy wall */}
        {showPrivacyWall ? (
          <div className="rounded-2xl border p-12 text-center"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
            <Lock size={36} className="mx-auto mb-4" style={{ color: 'var(--c-subtle)' }} />
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--c-text)' }}>
              {user.visibility === 'private' ? 'This profile is private.' : 'Friends-only portfolio.'}
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--c-muted)' }}>
              {user.visibility === 'private'
                ? `${user.preferredName ?? user.username} hasn't made their portfolio public.`
                : `You need to be friends with ${user.preferredName ?? user.username} to see their portfolio.`
              }
            </p>
            {isSignedIn && user.friendshipStatus?.status === 'none' && (
              <FriendButton
                ownerId={user.id}
                ownerUsername={user.username}
                initialStatus={user.friendshipStatus}
              />
            )}
          </div>
        ) : (
          <>
            {/* SKILLS */}
            <section>
              <SkillsSection username={user.username} isOwner={isOwner} />
            </section>

            {/* STATS CHART */}
            {entries.length > 0 && (
              <CollectionPieChart username={user.username} isOwner={isOwner} />
            )}

            {/* TOP 12 */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={18} style={{ color: 'var(--c-accent)' }} />
                <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>Top 12</h2>
              </div>
              {top12Loading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : top12.length === 0 ? (
                <p className="text-sm py-4" style={{ color: 'var(--c-muted)' }}>No Top 12 yet.</p>
              ) : (
                <Top12Grid items={top12} readOnly />
              )}
            </section>

            {/* COLLECTION */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <LayoutGrid size={18} style={{ color: 'var(--c-accent)' }} />
                <h2 className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>
                  Collection
                </h2>
                {!collectionLoading && (
                  <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    {entries.length} {entries.length === 1 ? 'title' : 'titles'}
                  </span>
                )}
              </div>
              {collectionLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <CollectionView entries={entries} readOnly />
              )}
            </section>

            {/* PORTFOLIO COMMENTS (friends + owner only) */}
            {(isFriend || isOwner) && (
              <section>
                <button
                  onClick={() => setShowComments(v => !v)}
                  className="flex items-center gap-2 mb-4 group"
                >
                  <MessageCircle size={18} style={{ color: 'var(--c-accent)' }} />
                  <h2 className="text-lg font-semibold group-hover:underline"
                    style={{ color: 'var(--c-text)' }}>
                    {isOwner ? 'Friend comments' : 'My comments'}
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                    {showComments ? '▲ hide' : '▼ show'}
                  </span>
                </button>
                {showComments && (
                  <div className="rounded-xl border p-4"
                    style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
                    <CommentSection
                      ownerId={user.id}
                      isFriend={isFriend}
                      isOwner={isOwner}
                    />
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </ThemeWrapper>
  )
}
