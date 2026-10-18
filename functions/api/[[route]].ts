import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { cors } from 'hono/cors'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, and, desc, asc, sql, inArray, or, like } from 'drizzle-orm'
import { createClerkClient } from '@clerk/backend' // still used for deleteUser in DELETE /me
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Webhook } from 'svix'
import * as schema from '../../src/db/schema'

// ── Types ────────────────────────────────────────────────────────────────────

type Env = {
  Bindings: {
    DATABASE_URL: string
    CLERK_SECRET_KEY: string
    CLERK_WEBHOOK_SECRET: string
    CLERK_PUBLISHABLE_KEY: string
    OMDB_API_KEY: string
  }
  Variables: {
    userId: string
    clerkId: string
  }
}

type ClerkWebhookEvent = {
  type: string
  data: { id: string; [key: string]: unknown }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDb(url: string) {
  return drizzle(neon(url), { schema })
}

function computeSeriesRating(ratings: (number | null)[]): number | null {
  const valid = ratings.filter((r): r is number => r !== null)
  if (valid.length === 0) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
}

function validateExternalUrl(url: string): schema.externalSiteEnum['enumValues'][number] | null {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host === 'imdb.com') return 'imdb'
    if (host === 'letterboxd.com') return 'letterboxd'
    if (host === 'rottentomatoes.com') return 'rotten_tomatoes'
    return null
  } catch { return null }
}

// ── Clerk JWT verification (jose) ─────────────────────────────────────────────

// Clerk's publishable key is "pk_test_" / "pk_live_" + base64(frontendApiDomain + "$").
// The frontend API domain hosts the JWKS and is the JWT issuer.
function getClerkIssuer(publishableKey: string): string {
  const encoded = publishableKey.split('_').slice(2).join('_')
  const domain = atob(encoded).replace(/\$$/, '')
  return `https://${domain}`
}

// Cache JWKS sets per issuer so keys aren't refetched on every request
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

/** Verify a Clerk session token; returns the Clerk user id (`sub`) or throws */
async function verifyClerkToken(token: string, publishableKey: string): Promise<string> {
  const issuer = getClerkIssuer(publishableKey)
  let jwks = jwksCache.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksCache.set(issuer, jwks)
  }
  const { payload } = await jwtVerify(token, jwks, { issuer })
  if (!payload.sub) throw new Error('Token missing sub')
  return payload.sub
}

// ── Phase 2 helpers ───────────────────────────────────────────────────────────

/** Try to resolve caller's DB user id from a Bearer token; returns null if not authed */
async function optionalAuth(c: { req: { header: (k: string) => string | undefined }; env: { CLERK_PUBLISHABLE_KEY: string; DATABASE_URL: string } }): Promise<string | null> {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const clerkId = await verifyClerkToken(auth.slice(7), c.env.CLERK_PUBLISHABLE_KEY)
    const db = getDb(c.env.DATABASE_URL)
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.clerkId, clerkId))
    return user?.id ?? null
  } catch { return null }
}

async function areFriends(db: ReturnType<typeof getDb>, a: string, b: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.friendships.id }).from(schema.friendships)
    .where(and(
      eq(schema.friendships.status, 'accepted'),
      or(
        and(eq(schema.friendships.requesterId, a), eq(schema.friendships.addresseeId, b)),
        and(eq(schema.friendships.requesterId, b), eq(schema.friendships.addresseeId, a)),
      ),
    ))
  return !!row
}

async function canViewPortfolio(db: ReturnType<typeof getDb>, ownerId: string, visibility: string, viewerId: string | null): Promise<boolean> {
  if (visibility === 'public') return true
  if (!viewerId) return false
  if (viewerId === ownerId) return true
  // friends_only and private: friends can always view
  return areFriends(db, viewerId, ownerId)
}

async function getFriendshipStatus(
  db: ReturnType<typeof getDb>,
  viewerId: string,
  ownerId: string,
): Promise<{ status: string; friendshipId?: string }> {
  if (viewerId === ownerId) return { status: 'self' }
  const [row] = await db.select().from(schema.friendships)
    .where(or(
      and(eq(schema.friendships.requesterId, viewerId), eq(schema.friendships.addresseeId, ownerId)),
      and(eq(schema.friendships.requesterId, ownerId), eq(schema.friendships.addresseeId, viewerId)),
    ))
  if (!row) return { status: 'none' }
  if (row.status === 'accepted') return { status: 'friends', friendshipId: row.id }
  if (row.requesterId === viewerId) return { status: 'pending_sent', friendshipId: row.id }
  return { status: 'pending_received', friendshipId: row.id }
}

async function isBlockedBy(db: ReturnType<typeof getDb>, ownerId: string, viewerId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.userBlocks.id }).from(schema.userBlocks)
    .where(and(eq(schema.userBlocks.blockerId, ownerId), eq(schema.userBlocks.blockedId, viewerId)))
  return !!row
}

async function notify(db: ReturnType<typeof getDb>, {
  userId, type, actorId, entityId, message,
}: { userId: string; type: schema.notificationTypeEnum['enumValues'][number]; actorId: string; entityId?: string; message: string }) {
  await db.insert(schema.notifications).values({ userId, type, actorId, entityId: entityId ?? null, message }).catch(() => {})
}

// ── App setup ────────────────────────────────────────────────────────────────

const app = new Hono<Env>().basePath('/api')

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:8787', 'http://localhost:8788'],
  credentials: true,
}))

// ── Auth middleware (skip public paths) ──────────────────────────────────────

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  const PUBLIC = ['/api/webhooks/', '/api/u/']
  if (PUBLIC.some(p => path.startsWith(p))) return next()

  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const clerkId = await verifyClerkToken(auth.slice(7), c.env.CLERK_PUBLISHABLE_KEY)

    const db = getDb(c.env.DATABASE_URL)
    const [user] = await db
      .select({ id: schema.users.id, clerkId: schema.users.clerkId })
      .from(schema.users)
      .where(eq(schema.users.clerkId, clerkId))

    if (!user) return c.json({ error: 'User not found' }, 404)
    c.set('userId', user.id)
    c.set('clerkId', clerkId)
    return next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK — Clerk user lifecycle
// ══════════════════════════════════════════════════════════════════════════════

app.post('/webhooks/clerk', async (c) => {
  const body = await c.req.text()
  const headers = {
    'svix-id':        c.req.header('svix-id') ?? '',
    'svix-timestamp': c.req.header('svix-timestamp') ?? '',
    'svix-signature': c.req.header('svix-signature') ?? '',
  }
  try {
    const wh = new Webhook(c.env.CLERK_WEBHOOK_SECRET)
    const evt = wh.verify(body, headers) as ClerkWebhookEvent
    const db = getDb(c.env.DATABASE_URL)

    if (evt.type === 'user.created') {
      await db.insert(schema.users).values({
        clerkId: evt.data.id,
        ageConfirmed: false,
        onboardingCompleted: false,
        theme: 'minimal',
        visibility: 'public',
      }).onConflictDoNothing()
    }

    if (evt.type === 'user.deleted' && evt.data.id) {
      await db.delete(schema.users).where(eq(schema.users.clerkId, evt.data.id))
    }

    return c.json({ ok: true })
  } catch {
    return c.json({ error: 'Webhook verification failed' }, 400)
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC PROFILE ROUTES  /api/u/:username
// ══════════════════════════════════════════════════════════════════════════════

app.get('/u/:username', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const username = c.req.param('username').toLowerCase()
  const [user] = await db
    .select({ id: schema.users.id, username: schema.users.username, preferredName: schema.users.preferredName, theme: schema.users.theme, visibility: schema.users.visibility })
    .from(schema.users)
    .where(eq(schema.users.username, username))
  if (!user) return c.json({ error: 'User not found' }, 404)

  const viewerId = await optionalAuth(c)

  // Blocked viewers get a 404 as if the user doesn't exist
  if (viewerId && viewerId !== user.id && await isBlockedBy(db, user.id, viewerId)) {
    return c.json({ error: 'User not found' }, 404)
  }

  const canView = await canViewPortfolio(db, user.id, user.visibility, viewerId)
  const friendshipStatus = viewerId ? await getFriendshipStatus(db, viewerId, user.id) : { status: 'none' }

  return c.json({ ...user, canView, friendshipStatus })
})

app.get('/u/:username/top12', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const username = c.req.param('username').toLowerCase()
  const [user] = await db
    .select({ id: schema.users.id, visibility: schema.users.visibility })
    .from(schema.users)
    .where(eq(schema.users.username, username))
  if (!user) return c.json({ error: 'User not found' }, 404)
  const viewerId = await optionalAuth(c)
  if (!await canViewPortfolio(db, user.id, user.visibility, viewerId)) return c.json([])

  const rows = await db
    .select({
      rank:      schema.top12.rank,
      entryId:   schema.top12.entryId,
      title:     schema.portfolioEntries.title,
      year:      schema.portfolioEntries.year,
      posterUrl: schema.portfolioEntries.posterUrl,
      category:  schema.portfolioEntries.category,
      rating:    schema.portfolioEntries.rating,
      isSeries:  schema.portfolioEntries.isSeries,
    })
    .from(schema.top12)
    .innerJoin(schema.portfolioEntries, eq(schema.top12.entryId, schema.portfolioEntries.id))
    .where(eq(schema.top12.userId, user.id))
    .orderBy(asc(schema.top12.rank))

  // For series, attach average rating
  const result = await Promise.all(rows.map(async (row) => {
    if (!row.isSeries) return row
    const seasons = await db
      .select({ rating: schema.seasonRatings.rating })
      .from(schema.seasonRatings)
      .where(eq(schema.seasonRatings.entryId, row.entryId))
    return { ...row, rating: computeSeriesRating(seasons.map(s => s.rating)) }
  }))

  return c.json(result)
})

app.get('/u/:username/collection', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const username = c.req.param('username').toLowerCase()
  const [user] = await db
    .select({ id: schema.users.id, visibility: schema.users.visibility })
    .from(schema.users)
    .where(eq(schema.users.username, username))
  if (!user) return c.json({ error: 'User not found' }, 404)
  const viewerId = await optionalAuth(c)
  if (!await canViewPortfolio(db, user.id, user.visibility, viewerId)) return c.json([])

  const entries = await db
    .select()
    .from(schema.portfolioEntries)
    .where(eq(schema.portfolioEntries.userId, user.id))
    .orderBy(desc(schema.portfolioEntries.createdAt))

  return c.json(await attachSeriesRatings(db, entries))
})

// Attach computed series rating to an array of entries
async function attachSeriesRatings(
  db: ReturnType<typeof getDb>,
  entries: typeof schema.portfolioEntries.$inferSelect[]
) {
  const seriesIds = entries.filter(e => e.isSeries).map(e => e.id)
  let seasonMap: Record<string, (number | null)[]> = {}
  if (seriesIds.length > 0) {
    const seasons = await db
      .select({ entryId: schema.seasonRatings.entryId, rating: schema.seasonRatings.rating })
      .from(schema.seasonRatings)
      .where(inArray(schema.seasonRatings.entryId, seriesIds))
    for (const s of seasons) {
      if (!seasonMap[s.entryId]) seasonMap[s.entryId] = []
      seasonMap[s.entryId].push(s.rating)
    }
  }
  return entries.map(e => ({
    ...e,
    rating: e.isSeries ? computeSeriesRating(seasonMap[e.id] ?? []) : e.rating,
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// CURRENT USER  /api/me
// ══════════════════════════════════════════════════════════════════════════════

app.get('/me', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, c.get('userId')))
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json(user)
})

app.post('/me/onboarding', async (c) => {
  const body = await c.req.json<{
    ageConfirmed: boolean
    username?: string
    preferredName?: string
  }>()
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')

  if (!body.ageConfirmed) return c.json({ error: 'Age confirmation required' }, 400)

  // Age-only step (first call)
  if (!body.username) {
    await db.update(schema.users)
      .set({ ageConfirmed: true, ageConfirmedAt: new Date() })
      .where(eq(schema.users.id, userId))
    return c.json({ step: 'age_confirmed' })
  }

  // Username step
  const username = body.username.toLowerCase().trim()
  if (!/^[a-z0-9_-]{3,20}$/.test(username))
    return c.json({ error: 'Username must be 3-20 chars: letters, numbers, _ or -' }, 400)

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.username, username), sql`id != ${userId}`))
  if (existing) return c.json({ error: 'Username already taken' }, 409)

  await db.update(schema.users)
    .set({
      ageConfirmed: true,
      ageConfirmedAt: new Date(),
      username,
      preferredName: (body.preferredName || username).trim(),
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))

  return c.json({ step: 'complete', username })
})

app.get('/me/check-username/:username', async (c) => {
  const username = c.req.param('username').toLowerCase()
  if (!/^[a-z0-9_-]{3,20}$/.test(username))
    return c.json({ available: false, reason: 'Invalid format' })
  const db = getDb(c.env.DATABASE_URL)
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
  return c.json({ available: !row })
})

app.patch('/me/settings', async (c) => {
  const body = await c.req.json<{
    theme?: 'minimal' | 'cinematic_dark' | 'poster_grid'
    visibility?: 'public' | 'friends_only' | 'private'
    preferredName?: string
  }>()
  const db = getDb(c.env.DATABASE_URL)
  const updates: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() }
  if (body.theme) updates.theme = body.theme
  if (body.visibility) updates.visibility = body.visibility
  if (body.preferredName) updates.preferredName = body.preferredName.trim()
  await db.update(schema.users).set(updates).where(eq(schema.users.id, c.get('userId')))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// OMDB  /api/omdb
// ══════════════════════════════════════════════════════════════════════════════

app.get('/omdb/search', async (c) => {
  const q = c.req.query('q')
  if (!q || q.trim().length < 1) return c.json({ error: 'Query required' }, 400)
  const url = `https://www.omdbapi.com/?s=${encodeURIComponent(q)}&apikey=${c.env.OMDB_API_KEY}`
  const res = await fetch(url)
  const data = await res.json<{ Search?: { imdbID: string; Title: string; Year: string; Type: string; Poster: string }[]; Error?: string }>()
  if (data.Error) return c.json({ results: [] })
  return c.json({
    results: (data.Search ?? []).map(r => ({
      imdbId:   r.imdbID,
      title:    r.Title,
      year:     r.Year,
      type:     r.Type,
      posterUrl: r.Poster !== 'N/A' ? r.Poster : null,
    })),
  })
})

app.get('/omdb/:imdbId', async (c) => {
  const imdbId = c.req.param('imdbId')
  const db = getDb(c.env.DATABASE_URL)

  // Check cache
  const [cached] = await db
    .select()
    .from(schema.omdbCache)
    .where(eq(schema.omdbCache.imdbId, imdbId))
  if (cached) return c.json(cached)

  // Fetch from OMDb
  const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${c.env.OMDB_API_KEY}`
  const res = await fetch(url)
  const raw = await res.json<{ Response: string; Error?: string; imdbID: string; Title: string; Year: string; Type: string; Poster: string; Runtime: string; totalSeasons?: string }>()
  if (raw.Response === 'False') return c.json({ error: raw.Error ?? 'Not found' }, 404)

  const record = {
    imdbId,
    title:        raw.Title,
    year:         raw.Year,
    type:         raw.Type,
    posterUrl:    raw.Poster !== 'N/A' ? raw.Poster : null,
    runtime:      raw.Runtime !== 'N/A' ? raw.Runtime : null,
    totalSeasons: raw.totalSeasons ? parseInt(raw.totalSeasons, 10) : null,
    rawData:      raw as Record<string, unknown>,
  }

  // Cache it
  await db.insert(schema.omdbCache).values(record).onConflictDoNothing()
  return c.json(record)
})

// ══════════════════════════════════════════════════════════════════════════════
// ENTRIES  /api/entries
// ══════════════════════════════════════════════════════════════════════════════

app.get('/entries', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const { category, status, q, sort } = c.req.query()

  let query = db
    .select()
    .from(schema.portfolioEntries)
    .where(eq(schema.portfolioEntries.userId, userId))
    .$dynamic()

  if (category && category !== 'all')
    query = query.where(eq(schema.portfolioEntries.category, category as schema.categoryEnum['enumValues'][number]))
  if (status && status !== 'all')
    query = query.where(eq(schema.portfolioEntries.status, status as schema.statusEnum['enumValues'][number]))
  if (q)
    query = query.where(like(schema.portfolioEntries.title, `%${q}%`))

  const orderBy = sort === 'title' ? asc(schema.portfolioEntries.title)
    : sort === 'year' ? desc(schema.portfolioEntries.year)
    : desc(schema.portfolioEntries.createdAt)

  const entries = await query.orderBy(orderBy)
  return c.json(await attachSeriesRatings(db, entries))
})

app.post('/entries', async (c) => {
  const body = await c.req.json<{
    imdbId?: string
    title: string
    year?: string
    posterUrl?: string
    category: schema.categoryEnum['enumValues'][number]
    status: schema.statusEnum['enumValues'][number]
    isSeries?: boolean
    lengthValue?: string
    lengthType?: schema.lengthTypeEnum['enumValues'][number]
    isManualEntry?: boolean
    manualLink?: string
  }>()

  if (!body.title?.trim()) return c.json({ error: 'Title required' }, 400)

  // Manual entries must have a valid link
  if (body.isManualEntry) {
    if (!body.manualLink) return c.json({ error: 'Manual entries require a link (IMDb, Letterboxd or Rotten Tomatoes)' }, 400)
    if (!validateExternalUrl(body.manualLink)) return c.json({ error: 'Manual link must be from IMDb, Letterboxd or Rotten Tomatoes' }, 400)
  }

  const db = getDb(c.env.DATABASE_URL)
  const [entry] = await db.insert(schema.portfolioEntries).values({
    userId:       c.get('userId'),
    imdbId:       body.imdbId ?? null,
    title:        body.title.trim(),
    year:         body.year ?? null,
    posterUrl:    body.posterUrl ?? null,
    category:     body.category,
    status:       body.status,
    isSeries:     body.isSeries ?? false,
    lengthValue:  body.lengthValue ?? null,
    lengthType:   body.lengthType ?? null,
    isManualEntry: body.isManualEntry ?? false,
    manualLink:   body.manualLink ?? null,
  }).returning()

  return c.json(entry, 201)
})

app.get('/entries/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [entry] = await db
    .select()
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, id), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  const [seasons, dates, links] = await Promise.all([
    db.select().from(schema.seasonRatings)
      .where(eq(schema.seasonRatings.entryId, id))
      .orderBy(asc(schema.seasonRatings.seasonNumber)),
    db.select().from(schema.watchDates)
      .where(eq(schema.watchDates.entryId, id))
      .orderBy(desc(schema.watchDates.watchedAt)),
    db.select().from(schema.externalLinks)
      .where(eq(schema.externalLinks.entryId, id)),
  ])

  const rating = entry.isSeries
    ? computeSeriesRating(seasons.map(s => s.rating))
    : entry.rating

  return c.json({ ...entry, rating, seasonRatings: seasons, watchDates: dates, externalLinks: links })
})

app.patch('/entries/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, id), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<Partial<{
    title: string; year: string; posterUrl: string
    category: schema.categoryEnum['enumValues'][number]
    status: schema.statusEnum['enumValues'][number]
    lengthValue: string; lengthType: schema.lengthTypeEnum['enumValues'][number]
    spoilerFreeReview: string; experienceWriteup: string
    manualLink: string
  }>>()

  const [updated] = await db.update(schema.portfolioEntries)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.portfolioEntries.id, id))
    .returning()
  return c.json(updated)
})

app.delete('/entries/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')
  await db.delete(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, id), eq(schema.portfolioEntries.userId, userId)))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// RATINGS  /api/entries/:id/rating  &  /api/entries/:id/seasons
// Special-rating constraint: only one item per user per special number (11-15).
// Reassignment is atomic — the old item becomes unrated.
// ══════════════════════════════════════════════════════════════════════════════

async function claimSpecialRating(
  db: ReturnType<typeof getDb>,
  userId: string,
  newRating: number,
  skipEntryId?: string,
  skipSeason?: { entryId: string; season: number },
): Promise<{ movedFrom?: string }> {
  if (newRating < 11) return {}

  // Find existing holder in portfolioEntries
  const [existingEntry] = await db
    .select({ id: schema.portfolioEntries.id, title: schema.portfolioEntries.title })
    .from(schema.portfolioEntries)
    .where(and(
      eq(schema.portfolioEntries.userId, userId),
      eq(schema.portfolioEntries.rating, newRating),
      skipEntryId ? sql`id != ${skipEntryId}` : sql`TRUE`,
    ))

  // Find existing holder in seasonRatings
  const [existingSeason] = await db
    .select({ id: schema.seasonRatings.id, entryId: schema.seasonRatings.entryId, seasonNumber: schema.seasonRatings.seasonNumber })
    .from(schema.seasonRatings)
    .where(and(
      eq(schema.seasonRatings.userId, userId),
      eq(schema.seasonRatings.rating, newRating),
      skipSeason
        ? sql`NOT (entry_id = ${skipSeason.entryId} AND season_number = ${skipSeason.season})`
        : sql`TRUE`,
    ))

  let movedFrom: string | undefined

  if (existingEntry) {
    await db.update(schema.portfolioEntries)
      .set({ rating: null, updatedAt: new Date() })
      .where(eq(schema.portfolioEntries.id, existingEntry.id))
    movedFrom = existingEntry.title
  }
  if (existingSeason) {
    await db.update(schema.seasonRatings)
      .set({ rating: null, updatedAt: new Date() })
      .where(eq(schema.seasonRatings.id, existingSeason.id))
  }

  return { movedFrom }
}

// Rate a movie / non-series entry
app.post('/entries/:id/rating', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')
  const { rating } = await c.req.json<{ rating: number | null }>()

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id, isSeries: schema.portfolioEntries.isSeries })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, id), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)
  if (entry.isSeries) return c.json({ error: 'Series are rated per season' }, 400)
  if (rating !== null && (rating < 1 || rating > 15)) return c.json({ error: 'Rating must be 1-15' }, 400)

  let movedFrom: string | undefined
  if (rating !== null && rating >= 11) {
    const result = await claimSpecialRating(db, userId, rating, id)
    movedFrom = result.movedFrom
  }

  await db.update(schema.portfolioEntries)
    .set({ rating: rating ?? null, updatedAt: new Date() })
    .where(eq(schema.portfolioEntries.id, id))

  return c.json({ ok: true, ...(movedFrom ? { notice: `Rating ${rating} moved from "${movedFrom}"` } : {}) })
})

// Rate a season
app.put('/entries/:id/seasons/:season', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')
  const season = parseInt(c.req.param('season'), 10)
  const { rating } = await c.req.json<{ rating: number | null }>()

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, entryId), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)
  if (rating !== null && (rating < 1 || rating > 15)) return c.json({ error: 'Rating must be 1-15' }, 400)

  let movedFrom: string | undefined
  if (rating !== null && rating >= 11) {
    const result = await claimSpecialRating(db, userId, rating, undefined, { entryId, season })
    movedFrom = result.movedFrom
  }

  // Upsert season rating
  await db.insert(schema.seasonRatings)
    .values({ entryId, userId, seasonNumber: season, rating })
    .onConflictDoUpdate({
      target: [schema.seasonRatings.entryId, schema.seasonRatings.seasonNumber],
      set: { rating: rating ?? null, updatedAt: new Date() },
    })

  return c.json({ ok: true, ...(movedFrom ? { notice: `Rating ${rating} moved from "${movedFrom}"` } : {}) })
})

app.delete('/entries/:id/seasons/:season', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')
  const season = parseInt(c.req.param('season'), 10)
  await db.delete(schema.seasonRatings)
    .where(and(
      eq(schema.seasonRatings.entryId, entryId),
      eq(schema.seasonRatings.userId, userId),
      eq(schema.seasonRatings.seasonNumber, season),
    ))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// WATCH DATES  /api/entries/:id/watch-dates
// ══════════════════════════════════════════════════════════════════════════════

app.post('/entries/:id/watch-dates', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, entryId), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    watchedAt?: string
    whereWatched?: schema.whereWatchedEnum['enumValues'][number]
    platform?: string
    watchedWith?: string
  }>()

  const [row] = await db.insert(schema.watchDates).values({
    entryId,
    userId,
    watchedAt: body.watchedAt ?? null,
    whereWatched: body.whereWatched ?? null,
    platform: body.platform ?? null,
    watchedWith: body.watchedWith ?? null,
  }).returning()

  return c.json(row, 201)
})

app.delete('/entries/:id/watch-dates/:wdId', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  await db.delete(schema.watchDates)
    .where(and(
      eq(schema.watchDates.id, c.req.param('wdId')),
      eq(schema.watchDates.userId, userId),
    ))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// EXTERNAL LINKS  /api/entries/:id/links
// ══════════════════════════════════════════════════════════════════════════════

app.put('/entries/:id/links', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, entryId), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ links: { site: string; url: string }[] }>()

  // Validate all URLs
  for (const l of body.links) {
    if (!validateExternalUrl(l.url)) return c.json({ error: `Invalid URL for site ${l.site}` }, 400)
  }

  // Delete then re-insert (simple upsert)
  await db.delete(schema.externalLinks).where(eq(schema.externalLinks.entryId, entryId))
  if (body.links.length > 0) {
    await db.insert(schema.externalLinks).values(
      body.links.map(l => ({
        entryId,
        site: l.site as schema.externalSiteEnum['enumValues'][number],
        url: l.url,
      }))
    )
  }

  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// REVIEWS  /api/entries/:id/review
// ══════════════════════════════════════════════════════════════════════════════

app.patch('/entries/:id/review', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')
  const body = await c.req.json<{ spoilerFreeReview?: string; experienceWriteup?: string }>()

  const [entry] = await db
    .select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, id), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  await db.update(schema.portfolioEntries)
    .set({ spoilerFreeReview: body.spoilerFreeReview ?? null, experienceWriteup: body.experienceWriteup ?? null, updatedAt: new Date() })
    .where(eq(schema.portfolioEntries.id, id))

  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// TOP 12  /api/top12
// ══════════════════════════════════════════════════════════════════════════════

app.get('/top12', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const rows = await db
    .select({
      rank:      schema.top12.rank,
      entryId:   schema.top12.entryId,
      title:     schema.portfolioEntries.title,
      year:      schema.portfolioEntries.year,
      posterUrl: schema.portfolioEntries.posterUrl,
      category:  schema.portfolioEntries.category,
      rating:    schema.portfolioEntries.rating,
      isSeries:  schema.portfolioEntries.isSeries,
    })
    .from(schema.top12)
    .innerJoin(schema.portfolioEntries, eq(schema.top12.entryId, schema.portfolioEntries.id))
    .where(eq(schema.top12.userId, userId))
    .orderBy(asc(schema.top12.rank))

  const result = await Promise.all(rows.map(async (row) => {
    if (!row.isSeries) return row
    const seasons = await db
      .select({ rating: schema.seasonRatings.rating })
      .from(schema.seasonRatings)
      .where(eq(schema.seasonRatings.entryId, row.entryId))
    return { ...row, rating: computeSeriesRating(seasons.map(s => s.rating)) }
  }))

  return c.json(result)
})

// Full replace — client sends ordered array of entryIds (rank = index + 1)
app.put('/top12', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const { entryIds } = await c.req.json<{ entryIds: string[] }>()

  if (entryIds.length > 12) return c.json({ error: 'Maximum 12 entries in Top 12' }, 400)

  // Verify all entries belong to user
  if (entryIds.length > 0) {
    const owned = await db
      .select({ id: schema.portfolioEntries.id })
      .from(schema.portfolioEntries)
      .where(and(
        inArray(schema.portfolioEntries.id, entryIds),
        eq(schema.portfolioEntries.userId, userId),
      ))
    if (owned.length !== entryIds.length) return c.json({ error: 'One or more entries not found' }, 400)
  }

  await db.delete(schema.top12).where(eq(schema.top12.userId, userId))
  if (entryIds.length > 0) {
    await db.insert(schema.top12).values(
      entryIds.map((entryId, i) => ({ userId, entryId, rank: i + 1 }))
    )
  }

  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// FRIENDS  /api/friends
// ══════════════════════════════════════════════════════════════════════════════

// My accepted friends list
app.get('/friends', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const rows = await db.select({
    friendshipId: schema.friendships.id,
    userId: schema.users.id,
    username: schema.users.username,
    preferredName: schema.users.preferredName,
  })
    .from(schema.friendships)
    .innerJoin(schema.users, or(
      and(eq(schema.friendships.requesterId, userId), eq(schema.users.id, schema.friendships.addresseeId)),
      and(eq(schema.friendships.addresseeId, userId), eq(schema.users.id, schema.friendships.requesterId)),
    ))
    .where(and(
      eq(schema.friendships.status, 'accepted'),
      or(eq(schema.friendships.requesterId, userId), eq(schema.friendships.addresseeId, userId)),
    ))
  return c.json(rows)
})

// Pending requests sent TO me
app.get('/friends/requests', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const rows = await db.select({
    friendshipId: schema.friendships.id,
    createdAt: schema.friendships.createdAt,
    fromUserId: schema.users.id,
    fromUsername: schema.users.username,
    fromName: schema.users.preferredName,
  })
    .from(schema.friendships)
    .innerJoin(schema.users, eq(schema.users.id, schema.friendships.requesterId))
    .where(and(eq(schema.friendships.addresseeId, userId), eq(schema.friendships.status, 'pending')))
    .orderBy(desc(schema.friendships.createdAt))
  return c.json(rows)
})

// Send a friend request (by username)
app.post('/friends/request/:username', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const targetUsername = c.req.param('username').toLowerCase()

  const [target] = await db.select({ id: schema.users.id, preferredName: schema.users.preferredName })
    .from(schema.users).where(eq(schema.users.username, targetUsername))
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.id === userId) return c.json({ error: 'Cannot friend yourself' }, 400)

  // Check no existing relationship
  const [existing] = await db.select({ id: schema.friendships.id }).from(schema.friendships)
    .where(or(
      and(eq(schema.friendships.requesterId, userId), eq(schema.friendships.addresseeId, target.id)),
      and(eq(schema.friendships.requesterId, target.id), eq(schema.friendships.addresseeId, userId)),
    ))
  if (existing) return c.json({ error: 'Friend request already exists or already friends' }, 409)

  const [me] = await db.select({ preferredName: schema.users.preferredName, username: schema.users.username })
    .from(schema.users).where(eq(schema.users.id, userId))

  const [friendship] = await db.insert(schema.friendships)
    .values({ requesterId: userId, addresseeId: target.id, status: 'pending' })
    .returning()

  await notify(db, {
    userId: target.id,
    type: 'friend_request',
    actorId: userId,
    entityId: friendship.id,
    message: `${me.preferredName ?? me.username} sent you a friend request`,
  })

  return c.json({ friendshipId: friendship.id, status: 'pending_sent' }, 201)
})

// Accept a pending request (addressee only)
app.post('/friends/accept/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [fs] = await db.select().from(schema.friendships)
    .where(and(eq(schema.friendships.id, id), eq(schema.friendships.addresseeId, userId), eq(schema.friendships.status, 'pending')))
  if (!fs) return c.json({ error: 'Request not found' }, 404)

  await db.update(schema.friendships).set({ status: 'accepted', updatedAt: new Date() }).where(eq(schema.friendships.id, id))

  const [me] = await db.select({ preferredName: schema.users.preferredName, username: schema.users.username })
    .from(schema.users).where(eq(schema.users.id, userId))

  await notify(db, {
    userId: fs.requesterId,
    type: 'friend_accepted',
    actorId: userId,
    entityId: id,
    message: `${me.preferredName ?? me.username} accepted your friend request`,
  })

  return c.json({ ok: true, status: 'friends' })
})

// Cancel pending request OR unfriend (either party)
app.delete('/friends/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [fs] = await db.select().from(schema.friendships).where(eq(schema.friendships.id, id))
  if (!fs) return c.json({ error: 'Not found' }, 404)
  if (fs.requesterId !== userId && fs.addresseeId !== userId)
    return c.json({ error: 'Forbidden' }, 403)

  await db.delete(schema.friendships).where(eq(schema.friendships.id, id))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// COMMENTS  /api/comments
// Friends can comment; owner can reply. A friend sees only their own thread.
// ══════════════════════════════════════════════════════════════════════════════

app.get('/comments', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const { ownerId, entryId } = c.req.query()
  if (!ownerId) return c.json({ error: 'ownerId required' }, 400)

  const isOwner = userId === ownerId
  const isFriend = !isOwner && await areFriends(db, userId, ownerId)
  if (!isOwner && !isFriend) return c.json({ error: 'Forbidden' }, 403)

  // Owner sees all comments; friend sees only their own thread
  const baseConditions = [
    eq(schema.comments.ownerId, ownerId),
    entryId ? eq(schema.comments.entryId, entryId) : sql`entry_id IS NULL`,
  ]

  let topLevel
  if (isOwner) {
    // All top-level comments (by any friend)
    topLevel = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
        authorUsername: schema.users.username,
        authorName: schema.users.preferredName,
        ownerId: schema.comments.ownerId,
        entryId: schema.comments.entryId,
        body: schema.comments.body,
        replyToId: schema.comments.replyToId,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(and(...baseConditions, sql`reply_to_id IS NULL`))
      .orderBy(asc(schema.comments.createdAt))
  } else {
    // Friend sees their own top-level comments
    topLevel = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
        authorUsername: schema.users.username,
        authorName: schema.users.preferredName,
        ownerId: schema.comments.ownerId,
        entryId: schema.comments.entryId,
        body: schema.comments.body,
        replyToId: schema.comments.replyToId,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(and(...baseConditions, sql`reply_to_id IS NULL`, eq(schema.comments.authorId, userId)))
      .orderBy(asc(schema.comments.createdAt))
  }

  // Attach replies for each top-level comment
  const withReplies = await Promise.all(topLevel.map(async (c_) => {
    const replies = await db
      .select({
        id: schema.comments.id,
        authorId: schema.comments.authorId,
        authorUsername: schema.users.username,
        authorName: schema.users.preferredName,
        ownerId: schema.comments.ownerId,
        entryId: schema.comments.entryId,
        body: schema.comments.body,
        replyToId: schema.comments.replyToId,
        createdAt: schema.comments.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(eq(schema.comments.replyToId, c_.id))
      .orderBy(asc(schema.comments.createdAt))
    return { ...c_, replies }
  }))

  return c.json(withReplies)
})

app.post('/comments', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const body = await c.req.json<{ ownerId: string; entryId?: string; body: string; replyToId?: string }>()

  if (!body.body?.trim()) return c.json({ error: 'Comment body required' }, 400)
  if (!body.ownerId) return c.json({ error: 'ownerId required' }, 400)

  const isOwner = userId === body.ownerId
  const isFriend = !isOwner && await areFriends(db, userId, body.ownerId)

  // Only friends can post new top-level comments; only owner can reply
  if (body.replyToId) {
    if (!isOwner) return c.json({ error: 'Only the portfolio owner can reply' }, 403)
  } else {
    if (!isFriend) return c.json({ error: 'Only friends can comment' }, 403)
  }

  const [comment] = await db.insert(schema.comments).values({
    authorId: userId,
    ownerId: body.ownerId,
    entryId: body.entryId ?? null,
    body: body.body.trim(),
    replyToId: body.replyToId ?? null,
  }).returning()

  const [me] = await db.select({ preferredName: schema.users.preferredName, username: schema.users.username })
    .from(schema.users).where(eq(schema.users.id, userId))

  if (isFriend) {
    // Notify portfolio owner of new comment
    await notify(db, {
      userId: body.ownerId,
      type: 'new_comment',
      actorId: userId,
      entityId: comment.id,
      message: `${me.preferredName ?? me.username} commented on your ${body.entryId ? 'entry' : 'portfolio'}`,
    })
  }

  if (isOwner && body.replyToId) {
    // Notify the friend that owner replied
    const [parent] = await db.select({ authorId: schema.comments.authorId })
      .from(schema.comments).where(eq(schema.comments.id, body.replyToId))
    if (parent && parent.authorId !== userId) {
      await notify(db, {
        userId: parent.authorId,
        type: 'new_reply',
        actorId: userId,
        entityId: comment.id,
        message: `${me.preferredName ?? me.username} replied to your comment`,
      })
    }
  }

  return c.json(comment, 201)
})

app.delete('/comments/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const id = c.req.param('id')

  const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, id))
  if (!comment) return c.json({ error: 'Not found' }, 404)

  // Comment author can delete their own; portfolio owner can delete any on their portfolio
  if (comment.authorId !== userId && comment.ownerId !== userId)
    return c.json({ error: 'Forbidden' }, 403)

  // Delete comment and any replies to it
  await db.delete(schema.comments).where(eq(schema.comments.replyToId, id))
  await db.delete(schema.comments).where(eq(schema.comments.id, id))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS  /api/notifications
// ══════════════════════════════════════════════════════════════════════════════

app.get('/notifications', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const rows = await db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      actorId: schema.notifications.actorId,
      actorUsername: schema.users.username,
      actorName: schema.users.preferredName,
      entityId: schema.notifications.entityId,
      message: schema.notifications.message,
      read: schema.notifications.read,
      createdAt: schema.notifications.createdAt,
    })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50)
  return c.json(rows)
})

app.post('/notifications/read-all', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  await db.update(schema.notifications)
    .set({ read: true })
    .where(and(eq(schema.notifications.userId, c.get('userId')), eq(schema.notifications.read, false)))
  return c.json({ ok: true })
})

app.patch('/notifications/:id/read', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  await db.update(schema.notifications)
    .set({ read: true })
    .where(and(eq(schema.notifications.id, c.req.param('id')), eq(schema.notifications.userId, c.get('userId'))))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// SKILLS  /api/skills
// ══════════════════════════════════════════════════════════════════════════════

app.get('/skills', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const rows = await db.select().from(schema.userSkills)
    .where(eq(schema.userSkills.userId, c.get('userId')))
    .orderBy(asc(schema.userSkills.createdAt))
  return c.json(rows)
})

app.post('/skills', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const { skill } = await c.req.json<{ skill: string }>()
  if (!skill?.trim()) return c.json({ error: 'Skill text required' }, 400)
  if (skill.trim().length > 60) return c.json({ error: 'Skill too long (max 60 chars)' }, 400)

  // Check limit
  const count = await db.select({ id: schema.userSkills.id }).from(schema.userSkills)
    .where(eq(schema.userSkills.userId, c.get('userId')))
  if (count.length >= 30) return c.json({ error: 'Maximum 30 skills' }, 400)

  const [row] = await db.insert(schema.userSkills)
    .values({ userId: c.get('userId'), skill: skill.trim() })
    .returning()
  return c.json(row, 201)
})

app.delete('/skills/:id', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  await db.delete(schema.userSkills)
    .where(and(eq(schema.userSkills.id, c.req.param('id')), eq(schema.userSkills.userId, c.get('userId'))))
  return c.json({ ok: true })
})

// Public skills endpoint
app.get('/u/:username/skills', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const username = c.req.param('username').toLowerCase()
  const [user] = await db.select({ id: schema.users.id, visibility: schema.users.visibility })
    .from(schema.users).where(eq(schema.users.username, username))
  if (!user) return c.json({ error: 'Not found' }, 404)
  const viewerId = await optionalAuth(c)
  if (viewerId && viewerId !== user.id && await isBlockedBy(db, user.id, viewerId)) return c.json([], 200)
  if (!await canViewPortfolio(db, user.id, user.visibility, viewerId)) return c.json([])
  const rows = await db.select({ id: schema.userSkills.id, skill: schema.userSkills.skill })
    .from(schema.userSkills).where(eq(schema.userSkills.userId, user.id)).orderBy(asc(schema.userSkills.createdAt))
  return c.json(rows)
})

// ══════════════════════════════════════════════════════════════════════════════
// COLLECTION STATS  /api/stats  &  /api/u/:username/stats
// ══════════════════════════════════════════════════════════════════════════════

async function buildStats(db: ReturnType<typeof getDb>, userId: string, showChart: boolean) {
  const entries = await db.select({
    category: schema.portfolioEntries.category,
    status: schema.portfolioEntries.status,
    rating: schema.portfolioEntries.rating,
    isSeries: schema.portfolioEntries.isSeries,
    spoilerFreeReview: schema.portfolioEntries.spoilerFreeReview,
  }).from(schema.portfolioEntries).where(eq(schema.portfolioEntries.userId, userId))

  const byCategory: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  let ratingSum = 0; let ratingCount = 0; let withReview = 0

  for (const e of entries) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
    if (e.rating !== null && !e.isSeries) { ratingSum += e.rating; ratingCount++ }
    if (e.spoilerFreeReview) withReview++
  }

  return {
    total: entries.length,
    byCategory,
    byStatus,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    withRating: ratingCount,
    withReview,
    showStatsChart: showChart,
  }
}

app.get('/stats', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const [me] = await db.select({ showStatsChart: schema.users.showStatsChart })
    .from(schema.users).where(eq(schema.users.id, userId))
  return c.json(await buildStats(db, userId, me?.showStatsChart ?? true))
})

app.get('/u/:username/stats', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const username = c.req.param('username').toLowerCase()
  const [user] = await db.select({ id: schema.users.id, visibility: schema.users.visibility, showStatsChart: schema.users.showStatsChart })
    .from(schema.users).where(eq(schema.users.username, username))
  if (!user) return c.json({ error: 'Not found' }, 404)
  const viewerId = await optionalAuth(c)
  if (!await canViewPortfolio(db, user.id, user.visibility, viewerId)) return c.json({ total: 0, byCategory: {}, byStatus: {}, avgRating: null, withRating: 0, withReview: 0, showStatsChart: false })
  return c.json(await buildStats(db, user.id, user.showStatsChart))
})

// ══════════════════════════════════════════════════════════════════════════════
// TIMELINE REACTIONS  /api/entries/:id/timeline
// ══════════════════════════════════════════════════════════════════════════════

app.get('/entries/:id/timeline', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')

  // Entry must belong to user OR viewer must be a friend of owner
  const [entry] = await db.select({ userId: schema.portfolioEntries.userId })
    .from(schema.portfolioEntries).where(eq(schema.portfolioEntries.id, entryId))
  if (!entry) return c.json({ error: 'Not found' }, 404)

  const isOwner = entry.userId === userId
  const friend = !isOwner && await areFriends(db, userId, entry.userId)
  if (!isOwner && !friend) return c.json({ error: 'Forbidden' }, 403)

  // Only owner's own reactions are stored
  const rows = await db.select().from(schema.timelineReactions)
    .where(and(eq(schema.timelineReactions.entryId, entryId), eq(schema.timelineReactions.userId, entry.userId)))
    .orderBy(asc(schema.timelineReactions.position), asc(schema.timelineReactions.createdAt))
  return c.json(rows)
})

app.post('/entries/:id/timeline', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const entryId = c.req.param('id')

  const [entry] = await db.select({ id: schema.portfolioEntries.id })
    .from(schema.portfolioEntries)
    .where(and(eq(schema.portfolioEntries.id, entryId), eq(schema.portfolioEntries.userId, userId)))
  if (!entry) return c.json({ error: 'Not found or not your entry' }, 404)

  const body = await c.req.json<{
    body: string; moodTag?: string
    markerMinute?: number; markerSeason?: number; markerEpisode?: number; position?: number
  }>()
  if (!body.body?.trim()) return c.json({ error: 'Reaction text required' }, 400)

  const [row] = await db.insert(schema.timelineReactions).values({
    entryId, userId,
    body: body.body.trim(),
    moodTag: body.moodTag?.trim() || null,
    markerMinute: body.markerMinute ?? null,
    markerSeason: body.markerSeason ?? null,
    markerEpisode: body.markerEpisode ?? null,
    position: body.position ?? 0,
  }).returning()
  return c.json(row, 201)
})

app.patch('/entries/:id/timeline/:reactionId', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const { id: entryId, reactionId } = c.req.param()
  const body = await c.req.json<Partial<{ body: string; moodTag: string; markerMinute: number; markerSeason: number; markerEpisode: number; position: number }>>()

  const [row] = await db.select({ id: schema.timelineReactions.id })
    .from(schema.timelineReactions)
    .where(and(eq(schema.timelineReactions.id, reactionId), eq(schema.timelineReactions.entryId, entryId), eq(schema.timelineReactions.userId, userId)))
  if (!row) return c.json({ error: 'Not found' }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.body !== undefined) updates.body = body.body.trim()
  if (body.moodTag !== undefined) updates.moodTag = body.moodTag?.trim() || null
  if (body.markerMinute !== undefined) updates.markerMinute = body.markerMinute
  if (body.markerSeason !== undefined) updates.markerSeason = body.markerSeason
  if (body.markerEpisode !== undefined) updates.markerEpisode = body.markerEpisode
  if (body.position !== undefined) updates.position = body.position

  const [updated] = await db.update(schema.timelineReactions).set(updates)
    .where(eq(schema.timelineReactions.id, reactionId)).returning()
  return c.json(updated)
})

app.delete('/entries/:id/timeline/:reactionId', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  await db.delete(schema.timelineReactions)
    .where(and(eq(schema.timelineReactions.id, c.req.param('reactionId')), eq(schema.timelineReactions.userId, userId)))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNT  /api/me  (deletion & export)
// ══════════════════════════════════════════════════════════════════════════════

app.delete('/me', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const clerkId = c.get('clerkId')

  // Delete from DB first (cascade removes all related data)
  await db.delete(schema.users).where(eq(schema.users.id, userId))

  // Delete from Clerk
  try {
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY })
    await clerk.users.deleteUser(clerkId)
  } catch { /* Ignore Clerk errors — DB already cleaned up */ }

  return c.json({ ok: true })
})

app.get('/me/export', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')

  const [profile] = await db.select({
    username: schema.users.username, preferredName: schema.users.preferredName,
    theme: schema.users.theme, visibility: schema.users.visibility,
    ageConfirmedAt: schema.users.ageConfirmedAt, createdAt: schema.users.createdAt,
  }).from(schema.users).where(eq(schema.users.id, userId))

  const [entries, skills, top12Rows, friends] = await Promise.all([
    db.select().from(schema.portfolioEntries).where(eq(schema.portfolioEntries.userId, userId)),
    db.select().from(schema.userSkills).where(eq(schema.userSkills.userId, userId)),
    db.select({
      rank: schema.top12.rank,
      title: schema.portfolioEntries.title,
    }).from(schema.top12).innerJoin(schema.portfolioEntries, eq(schema.top12.entryId, schema.portfolioEntries.id))
      .where(eq(schema.top12.userId, userId)).orderBy(asc(schema.top12.rank)),
    db.select({ username: schema.users.username, preferredName: schema.users.preferredName })
      .from(schema.friendships)
      .innerJoin(schema.users, or(
        and(eq(schema.friendships.requesterId, userId), eq(schema.users.id, schema.friendships.addresseeId)),
        and(eq(schema.friendships.addresseeId, userId), eq(schema.users.id, schema.friendships.requesterId)),
      ))
      .where(and(
        eq(schema.friendships.status, 'accepted'),
        or(eq(schema.friendships.requesterId, userId), eq(schema.friendships.addresseeId, userId)),
      )),
  ])

  // Attach related data for each entry
  const enrichedEntries = await Promise.all(entries.map(async (e) => {
    const [seasons, dates, links, timeline] = await Promise.all([
      db.select().from(schema.seasonRatings).where(eq(schema.seasonRatings.entryId, e.id)),
      db.select().from(schema.watchDates).where(eq(schema.watchDates.entryId, e.id)),
      db.select().from(schema.externalLinks).where(eq(schema.externalLinks.entryId, e.id)),
      db.select().from(schema.timelineReactions).where(eq(schema.timelineReactions.entryId, e.id)),
    ])
    return { ...e, seasonRatings: seasons, watchDates: dates, externalLinks: links, timeline }
  }))

  return c.json({
    exportedAt: new Date().toISOString(),
    profile,
    entries: enrichedEntries,
    skills,
    top12: top12Rows,
    friends,
  })
})

app.patch('/me/settings', async (c) => {
  // Extend existing settings with Phase 3 showStatsChart
  const body = await c.req.json<{ showStatsChart?: boolean }>()
  if (body.showStatsChart !== undefined) {
    const db = getDb(c.env.DATABASE_URL)
    await db.update(schema.users).set({ showStatsChart: body.showStatsChart, updatedAt: new Date() })
      .where(eq(schema.users.id, c.get('userId')))
  }
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// BLOCK  /api/block
// ══════════════════════════════════════════════════════════════════════════════

app.get('/block', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const rows = await db.select({
    blockId: schema.userBlocks.id,
    userId: schema.users.id,
    username: schema.users.username,
    preferredName: schema.users.preferredName,
  }).from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
    .where(eq(schema.userBlocks.blockerId, c.get('userId')))
    .orderBy(desc(schema.userBlocks.createdAt))
  return c.json(rows)
})

app.post('/block/:username', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const username = c.req.param('username').toLowerCase()
  const [target] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.username, username))
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.id === userId) return c.json({ error: 'Cannot block yourself' }, 400)

  // Also remove any friendship
  await db.delete(schema.friendships).where(or(
    and(eq(schema.friendships.requesterId, userId), eq(schema.friendships.addresseeId, target.id)),
    and(eq(schema.friendships.requesterId, target.id), eq(schema.friendships.addresseeId, userId)),
  ))

  await db.insert(schema.userBlocks)
    .values({ blockerId: userId, blockedId: target.id })
    .onConflictDoNothing()
  return c.json({ ok: true })
})

app.delete('/block/:blockId', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  await db.delete(schema.userBlocks)
    .where(and(eq(schema.userBlocks.id, c.req.param('blockId')), eq(schema.userBlocks.blockerId, c.get('userId'))))
  return c.json({ ok: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// REPORT  /api/report
// ══════════════════════════════════════════════════════════════════════════════

app.post('/report', async (c) => {
  const db = getDb(c.env.DATABASE_URL)
  const userId = c.get('userId')
  const body = await c.req.json<{
    targetUserId?: string; targetEntryId?: string
    reason: schema.reportReasonEnum['enumValues'][number]; details?: string
  }>()

  if (!body.reason) return c.json({ error: 'Reason required' }, 400)
  if (!body.targetUserId && !body.targetEntryId) return c.json({ error: 'Target required' }, 400)
  if (body.targetUserId === userId) return c.json({ error: 'Cannot report yourself' }, 400)

  await db.insert(schema.userReports).values({
    reporterId: userId,
    targetUserId: body.targetUserId ?? null,
    targetEntryId: body.targetEntryId ?? null,
    reason: body.reason,
    details: body.details?.trim() || null,
  })
  return c.json({ ok: true })
})

// ─────────────────────────────────────────────────────────────────────────────

export const onRequest = handle(app)