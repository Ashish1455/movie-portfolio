import {
  pgTable, text, timestamp, boolean, integer,
  uuid, pgEnum, jsonb, date, uniqueIndex, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────

export const categoryEnum = pgEnum('category', [
  'movie', 'tv_series', 'anime', 'documentary',
])
export const statusEnum = pgEnum('status', ['completed', 'watching'])
export const visibilityEnum = pgEnum('visibility', ['public', 'friends_only', 'private'])
export const themeEnum = pgEnum('theme', ['minimal', 'cinematic_dark', 'poster_grid'])
export const whereWatchedEnum = pgEnum('where_watched', ['theater', 'ott', 'other'])
export const externalSiteEnum = pgEnum('external_site', ['imdb', 'letterboxd', 'rotten_tomatoes'])
export const lengthTypeEnum = pgEnum('length_type', ['runtime', 'episodes', 'seasons'])
export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted'])
export const notificationTypeEnum = pgEnum('notification_type', [
  'friend_request', 'friend_accepted', 'new_comment', 'new_reply',
])

// ── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  clerkId:              text('clerk_id').notNull().unique(),
  username:             text('username').unique(),          // set during onboarding
  preferredName:        text('preferred_name'),             // display name, not unique
  ageConfirmed:         boolean('age_confirmed').notNull().default(false),
  ageConfirmedAt:       timestamp('age_confirmed_at'),
  theme:                themeEnum('theme').notNull().default('minimal'),
  visibility:           visibilityEnum('visibility').notNull().default('public'),
  onboardingCompleted:  boolean('onboarding_completed').notNull().default(false),
  showStatsChart:       boolean('show_stats_chart').notNull().default(true),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
})

// ── OMDb cache (server-side, never re-fetch the same title) ─────────────────

export const omdbCache = pgTable('omdb_cache', {
  imdbId:       text('imdb_id').primaryKey(),
  title:        text('title').notNull(),
  year:         text('year'),
  type:         text('type'),           // 'movie' | 'series'
  posterUrl:    text('poster_url'),
  runtime:      text('runtime'),        // e.g. "148 min"
  totalSeasons: integer('total_seasons'),
  rawData:      jsonb('raw_data').$type<Record<string, unknown>>().notNull(),
  cachedAt:     timestamp('cached_at').notNull().defaultNow(),
})

// ── Portfolio entries ────────────────────────────────────────────────────────

export const portfolioEntries = pgTable('portfolio_entries', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  imdbId:            text('imdb_id'),   // null for manual entries
  title:             text('title').notNull(),
  year:              text('year'),
  posterUrl:         text('poster_url'),
  category:          categoryEnum('category').notNull(),
  status:            statusEnum('status').notNull().default('completed'),
  // rating: 1-10 regular, 11-15 special. Null for series (computed from seasons).
  rating:            integer('rating'),
  isSeries:          boolean('is_series').notNull().default(false),
  lengthValue:       text('length_value'),
  lengthType:        lengthTypeEnum('length_type'),
  spoilerFreeReview: text('spoiler_free_review'),
  experienceWriteup: text('experience_writeup'),
  isManualEntry:     boolean('is_manual_entry').notNull().default(false),
  manualLink:        text('manual_link'),  // required for manual entries
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  userIdx:   index('pe_user_idx').on(t.userId),
  imdbIdx:   index('pe_imdb_idx').on(t.imdbId),
}))

// ── Season ratings (for isSeries=true entries) ───────────────────────────────

export const seasonRatings = pgTable('season_ratings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  entryId:       uuid('entry_id').notNull().references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  userId:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  seasonNumber:  integer('season_number').notNull(),
  rating:        integer('rating'),    // 1-15; null if special was moved away
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqueSeason: uniqueIndex('sr_unique_entry_season').on(t.entryId, t.seasonNumber),
  userIdx:      index('sr_user_idx').on(t.userId),
}))

// ── Watch dates (supports multiple / rewatches) ──────────────────────────────

export const watchDates = pgTable('watch_dates', {
  id:           uuid('id').primaryKey().defaultRandom(),
  entryId:      uuid('entry_id').notNull().references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  watchedAt:    date('watched_at'),
  whereWatched: whereWatchedEnum('where_watched'),
  platform:     text('platform'),
  watchedWith:  text('watched_with'),  // hidden when empty
  createdAt:    timestamp('created_at').notNull().defaultNow(),
})

// ── External links ───────────────────────────────────────────────────────────

export const externalLinks = pgTable('external_links', {
  id:      uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  site:    externalSiteEnum('site').notNull(),
  url:     text('url').notNull(),
}, (t) => ({
  uniqueSite: uniqueIndex('el_unique_entry_site').on(t.entryId, t.site),
}))

// ── Top 12 ───────────────────────────────────────────────────────────────────

export const top12 = pgTable('top12', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entryId:   uuid('entry_id').notNull().references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  rank:      integer('rank').notNull(),  // 1-12
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqueUserEntry: uniqueIndex('t12_unique_user_entry').on(t.userId, t.entryId),
  uniqueUserRank:  uniqueIndex('t12_unique_user_rank').on(t.userId, t.rank),
}))

// ── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  entries: many(portfolioEntries),
  top12:   many(top12),
}))

export const portfolioEntriesRelations = relations(portfolioEntries, ({ one, many }) => ({
  user:          one(users, { fields: [portfolioEntries.userId], references: [users.id] }),
  seasonRatings: many(seasonRatings),
  watchDates:    many(watchDates),
  externalLinks: many(externalLinks),
  top12:         many(top12),
}))

export const seasonRatingsRelations = relations(seasonRatings, ({ one }) => ({
  entry: one(portfolioEntries, { fields: [seasonRatings.entryId], references: [portfolioEntries.id] }),
  user:  one(users, { fields: [seasonRatings.userId], references: [users.id] }),
}))

export const watchDatesRelations = relations(watchDates, ({ one }) => ({
  entry: one(portfolioEntries, { fields: [watchDates.entryId], references: [portfolioEntries.id] }),
}))

export const externalLinksRelations = relations(externalLinks, ({ one }) => ({
  entry: one(portfolioEntries, { fields: [externalLinks.entryId], references: [portfolioEntries.id] }),
}))

export const top12Relations = relations(top12, ({ one }) => ({
  user:  one(users, { fields: [top12.userId], references: [users.id] }),
  entry: one(portfolioEntries, { fields: [top12.entryId], references: [portfolioEntries.id] }),
}))

// ── Phase 2 tables ────────────────────────────────────────────────────────────

// Friendships — bidirectional request + accept model
export const friendships = pgTable('friendships', {
  id:          uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addresseeId: uuid('addressee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status:      friendshipStatusEnum('status').notNull().default('pending'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniquePair: uniqueIndex('fs_unique_pair').on(t.requesterId, t.addresseeId),
  requesterIdx: index('fs_requester_idx').on(t.requesterId),
  addresseeIdx: index('fs_addressee_idx').on(t.addresseeId),
}))

// Comments — on portfolio (entryId null) or on a specific entry
export const comments = pgTable('comments', {
  id:        uuid('id').primaryKey().defaultRandom(),
  authorId:  uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ownerId:   uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entryId:   uuid('entry_id').references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  body:      text('body').notNull(),
  // replyToId: owner replies to a friend's comment; plain uuid (self-ref, no FK to avoid cycles)
  replyToId: uuid('reply_to_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('c_owner_idx').on(t.ownerId),
  entryIdx: index('c_entry_idx').on(t.entryId),
}))

// Notifications — in-app only
export const notifications = pgTable('notifications', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:      notificationTypeEnum('type').notNull(),
  actorId:   uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  entityId:  uuid('entity_id'),   // friendshipId or commentId
  message:   text('message').notNull(),
  read:      boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('n_user_idx').on(t.userId),
  readIdx: index('n_read_idx').on(t.userId, t.read),
}))

// ── Phase 2 relations ─────────────────────────────────────────────────────────

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(users, { fields: [friendships.requesterId], references: [users.id], relationName: 'sent' }),
  addressee: one(users, { fields: [friendships.addresseeId], references: [users.id], relationName: 'received' }),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  owner:  one(users, { fields: [comments.ownerId],  references: [users.id] }),
  entry:  one(portfolioEntries, { fields: [comments.entryId], references: [portfolioEntries.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user:  one(users, { fields: [notifications.userId],  references: [users.id] }),
  actor: one(users, { fields: [notifications.actorId], references: [users.id] }),
}))

// ── Phase 3 tables ────────────────────────────────────────────────────────────

export const reportReasonEnum = pgEnum('report_reason', [
  'spam', 'harassment', 'inappropriate_content', 'other',
])

// User-defined skill tags (displayed on profile)
export const userSkills = pgTable('user_skills', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skill:     text('skill').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('us_user_idx').on(t.userId),
}))

// Reaction timeline entries inside an entry's experience
export const timelineReactions = pgTable('timeline_reactions', {
  id:             uuid('id').primaryKey().defaultRandom(),
  entryId:        uuid('entry_id').notNull().references(() => portfolioEntries.id, { onDelete: 'cascade' }),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:           text('body').notNull(),
  moodTag:        text('mood_tag'),          // user-defined e.g. "shocked", "crying"
  markerMinute:   integer('marker_minute'),  // minute timestamp
  markerSeason:   integer('marker_season'),  // series: season number
  markerEpisode:  integer('marker_episode'), // series: episode number
  position:       integer('position').notNull().default(0),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  entryIdx: index('tr_entry_idx').on(t.entryId),
}))

// Blocked users
export const userBlocks = pgTable('user_blocks', {
  id:        uuid('id').primaryKey().defaultRandom(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniquePair:  uniqueIndex('ub_unique_pair').on(t.blockerId, t.blockedId),
  blockerIdx:  index('ub_blocker_idx').on(t.blockerId),
}))

// Reports
export const userReports = pgTable('user_reports', {
  id:              uuid('id').primaryKey().defaultRandom(),
  reporterId:      uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId:    uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetEntryId:   uuid('target_entry_id').references(() => portfolioEntries.id, { onDelete: 'set null' }),
  reason:          reportReasonEnum('reason').notNull(),
  details:         text('details'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
})

// ── Phase 3 relations ─────────────────────────────────────────────────────────

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  user: one(users, { fields: [userSkills.userId], references: [users.id] }),
}))

export const timelineReactionsRelations = relations(timelineReactions, ({ one }) => ({
  entry: one(portfolioEntries, { fields: [timelineReactions.entryId], references: [portfolioEntries.id] }),
  user:  one(users, { fields: [timelineReactions.userId], references: [users.id] }),
}))

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, { fields: [userBlocks.blockerId], references: [users.id] }),
  blocked: one(users, { fields: [userBlocks.blockedId], references: [users.id] }),
}))
