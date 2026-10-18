// ── Enums (mirror the DB enums) ───────────────────────────────────────────────

export type Category = 'movie' | 'tv_series' | 'anime' | 'documentary'
export type Status   = 'completed' | 'watching'
export type Visibility = 'public' | 'friends_only' | 'private'
export type Theme    = 'minimal' | 'cinematic_dark' | 'poster_grid'
export type WhereWatched = 'theater' | 'ott' | 'other'
export type ExternalSite = 'imdb' | 'letterboxd' | 'rotten_tomatoes'
export type LengthType = 'runtime' | 'episodes' | 'seasons'

// ── API response shapes ───────────────────────────────────────────────────────

export interface User {
  id: string
  clerkId: string
  username: string | null
  preferredName: string | null
  ageConfirmed: boolean
  ageConfirmedAt: string | null
  theme: Theme
  visibility: Visibility
  onboardingCompleted: boolean
  showStatsChart: boolean
  createdAt: string
  updatedAt: string
}

// ── Phase 3 ───────────────────────────────────────────────────────────────────

export interface Skill {
  id: string
  skill: string
  createdAt: string
}

export interface TimelineReaction {
  id: string
  entryId: string
  body: string
  moodTag: string | null
  markerMinute: number | null
  markerSeason: number | null
  markerEpisode: number | null
  position: number
  createdAt: string
}

export interface CollectionStats {
  total: number
  byCategory: Record<string, number>
  byStatus: Record<string, number>
  avgRating: number | null
  withRating: number
  withReview: number
  showStatsChart: boolean
}

export type ReportReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other'

export interface BlockedUser {
  blockId: string
  userId: string
  username: string
  preferredName: string | null
}

export interface PublicUser {
  id: string
  username: string
  preferredName: string | null
  theme: Theme
  visibility: Visibility
}

export interface SeasonRating {
  id: string
  entryId: string
  userId: string
  seasonNumber: number
  rating: number | null
  createdAt: string
  updatedAt: string
}

export interface WatchDate {
  id: string
  watchedAt: string | null
  whereWatched: WhereWatched | null
  platform: string | null
  watchedWith: string | null
  createdAt: string
}

export interface ExternalLink {
  id: string
  site: ExternalSite
  url: string
}

export interface PortfolioEntry {
  id: string
  userId: string
  imdbId: string | null
  title: string
  year: string | null
  posterUrl: string | null
  category: Category
  status: Status
  rating: number | null       // computed avg for series
  isSeries: boolean
  lengthValue: string | null
  lengthType: LengthType | null
  spoilerFreeReview: string | null
  experienceWriteup: string | null
  isManualEntry: boolean
  manualLink: string | null
  createdAt: string
  updatedAt: string
  // present only in detail view
  seasonRatings?: SeasonRating[]
  watchDates?: WatchDate[]
  externalLinks?: ExternalLink[]
}

export interface Top12Item {
  rank: number
  entryId: string
  title: string
  year: string | null
  posterUrl: string | null
  category: Category
  rating: number | null
  isSeries: boolean
}

// ── Phase 2 types ─────────────────────────────────────────────────────────────

export type FriendshipStatus =
  | { status: 'self' }
  | { status: 'none' }
  | { status: 'pending_sent';     friendshipId: string }
  | { status: 'pending_received'; friendshipId: string }
  | { status: 'friends';          friendshipId: string }

export interface PublicUserWithFriendship extends PublicUser {
  friendshipStatus: FriendshipStatus
  canView: boolean   // resolved from visibility + friendship
}

export interface Friend {
  friendshipId: string
  userId: string
  username: string
  preferredName: string | null
}

export interface FriendRequest {
  friendshipId: string
  from: { userId: string; username: string; preferredName: string | null }
  createdAt: string
}

export interface Comment {
  id: string
  authorId: string
  authorUsername: string
  authorName: string | null
  ownerId: string
  entryId: string | null
  body: string
  replyToId: string | null
  createdAt: string
  replies?: Comment[]
}

export type NotificationType = 'friend_request' | 'friend_accepted' | 'new_comment' | 'new_reply'

export interface Notification {
  id: string
  type: NotificationType
  actorId: string | null
  actorName: string | null
  actorUsername: string | null
  entityId: string | null
  message: string
  read: boolean
  createdAt: string
}

// ── OMDb shapes ───────────────────────────────────────────────────────────────

export interface OmdbSearchResult {
  imdbId: string
  title: string
  year: string
  type: string
  posterUrl: string | null
}

export interface OmdbDetail {
  imdbId: string
  title: string
  year: string | null
  type: string | null
  posterUrl: string | null
  runtime: string | null
  totalSeasons: number | null
}
