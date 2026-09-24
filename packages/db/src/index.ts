import { and, desc, eq, gt, gte, isNull, lt, max, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import {
  authAttempts,
  authCodeRequests,
  authCodes,
  feedbackItems,
  feedbackRateLimits,
  feedbackVotes,
  npmDownloadSnapshots,
  passkeyChallenges,
  passkeyCredentials,
  projectPreferences,
  projectSnapshots,
  releaseAssetSnapshots,
  sessions,
  storeMetricPoints,
  storeSyncRuns,
  syncRuns,
  vscodeExtensionSnapshots,
  websiteAnalyticsSnapshots
} from './schema'

export * from './schema'

export type ObservatoryDb = ReturnType<typeof createDb>

export interface SnapshotWrite {
  archived: boolean
  category: string
  collectedAt: number
  description: string | null
  forks: number
  githubClones14d: number | null
  githubViews14d: number | null
  healthStatus: string
  id: string
  latestVersion: string | null
  name: string
  npmDownloads30d: number
  npmPackages: readonly string[]
  openIssues: number
  pushedAt: string | null
  relevanceScore: number
  repositoryUrl: string
  responseTimeMs: number | null
  slug: string
  stars: number
  status: string
  syncRunId: string
  topics: readonly string[]
  visibility: string
  websiteUrl: string | null
}

export interface WebsiteAnalyticsWrite {
  collectedAt: number
  hostname: string
  id: string
  pageViews: number
  periodEnd: number
  periodStart: number
  sampleInterval: number
  slug: string
  visits: number
}

export interface NpmDownloadWrite {
  collectedAt: number
  downloads: number
  id: string
  packageName: string
  periodStart: number
  slug: string
}

export interface VscodeExtensionWrite {
  collectedAt: number
  downloads: number
  extensionId: string
  id: string
  installs: number
  lastUpdated: string
  provider: 'open-vsx' | 'vscode-marketplace'
  rating: number | null
  reviewCount: number
  slug: string
  syncRunId: string
  updateCount: number
  version: string
}

export interface ReleaseAssetWrite {
  assetId: string
  assetName: string
  channel: 'direct' | 'homebrew' | 'homebrew-or-update' | 'update' | 'website'
  collectedAt: number
  downloads: number
  id: string
  releaseTag: string
  repository: string
  slug: string
  syncRunId: string
}

export type StoreMetricDimension = 'appVersion' | 'country' | 'device' |
  'osVersion' | 'overall'

export type StoreMetricProvider = 'apple' | 'google'

export interface StoreMetricWrite {
  appSlug: string
  collectedAt: number
  dimension: StoreMetricDimension
  dimensionValue: string
  id: string
  metric: string
  periodStart: number
  provider: StoreMetricProvider
  source: string
  value: number
}

export const storeMetricWriteColumnCount = 10

export interface StoreSyncRunWrite {
  appSlug: string
  completedAt: number | null
  errorCode: string | null
  id: string
  provider: StoreMetricProvider
  records: number
  startedAt: number
  status: 'failed' | 'skipped' | 'succeeded'
}

export interface ProjectPreferenceWrite {
  attentionMode?: 'all' | 'health' | 'off'
  enabled?: boolean
  pinned?: boolean
  websiteAnalyticsEnabled?: boolean
}

export interface FeedbackWrite {
  contactEmail: string | null
  createdAt: number
  description: string
  diagnosticReport: string | null
  id: string
  locale: string
  projectSlug: string
  source: 'android' | 'ios' | 'website'
  title: string
  type: 'idea' | 'bug' | 'message'
  updatedAt: number
}

export interface FeedbackUpdate {
  isPublic?: boolean
  moderationStatus?: 'pending' | 'approved' | 'rejected'
  status?: 'inbox' | 'under_review' | 'planned' | 'in_progress' | 'shipped' | 'closed'
}

export const createDb = (client: D1Database) => drizzle(client)

export const createFeedbackItem = async (
  db: ObservatoryDb,
  values: FeedbackWrite
): Promise<void> => {
  await db.insert(feedbackItems).values({
    ...values,
    isPublic: values.type === 'idea'
  })
}

export const listPublicFeedback = async (
  db: ObservatoryDb,
  projectSlug: string,
  options: {
    sort: 'new' | 'top'
    status?: FeedbackUpdate['status']
    voterHash?: string
  }
) => {
  const conditions = [
    eq(feedbackItems.projectSlug, projectSlug),
    eq(feedbackItems.type, 'idea'),
    eq(feedbackItems.moderationStatus, 'approved'),
    eq(feedbackItems.isPublic, true)
  ]

  if (options.status) conditions.push(eq(feedbackItems.status, options.status))

  const voterHash = options.voterHash ?? '__anonymous__'

  const rows = await db
    .select({
      createdAt: feedbackItems.createdAt,
      description: feedbackItems.description,
      hasVoted: sql<boolean>`${feedbackVotes.itemId} is not null`,
      id: feedbackItems.id,
      locale: feedbackItems.locale,
      status: feedbackItems.status,
      title: feedbackItems.title,
      updatedAt: feedbackItems.updatedAt,
      voteCount: feedbackItems.voteCount
    })
    .from(feedbackItems)
    .leftJoin(
      feedbackVotes, and(
        eq(feedbackVotes.itemId, feedbackItems.id), eq(feedbackVotes.voterHash, voterHash)
      )
    )
    .where(and(...conditions))
    .orderBy(
      options.sort === 'new' ?
        desc(feedbackItems.createdAt) :
        desc(feedbackItems.voteCount), desc(feedbackItems.createdAt)
    )
    .limit(200)

  return rows
}

export const listAdminFeedback = async (
  db: ObservatoryDb,
  projectSlug?: string
) => {
  const query = db.select().from(feedbackItems)

  return projectSlug ?
    query
      .where(eq(feedbackItems.projectSlug, projectSlug))
      .orderBy(desc(feedbackItems.updatedAt), desc(feedbackItems.createdAt))
      .limit(500) :
    query
      .orderBy(desc(feedbackItems.updatedAt), desc(feedbackItems.createdAt))
      .limit(500)
}

export const updateFeedbackItem = async (
  db: ObservatoryDb,
  projectSlug: string,
  id: string,
  values: FeedbackUpdate,
  updatedAt: number
) => {
  const current = await db
    .select()
    .from(feedbackItems)
    .where(and(
      eq(feedbackItems.id, id), eq(feedbackItems.projectSlug, projectSlug)
    ))
    .limit(1)
    .then(rows => rows[0] ?? null)

  if (!current) return null

  const isPublic = current.type === 'idea' ?
    (values.isPublic ?? current.isPublic) :
    false

  await db
    .update(feedbackItems)
    .set({ ...values, isPublic, updatedAt })
    .where(and(
      eq(feedbackItems.id, id), eq(feedbackItems.projectSlug, projectSlug)
    ))

  return { ...current, ...values, isPublic, updatedAt }
}

export const deleteFeedbackItem = async (
  db: ObservatoryDb,
  projectSlug: string,
  id: string
): Promise<boolean> => {
  const result = await db.delete(feedbackItems).where(and(
    eq(feedbackItems.id, id), eq(feedbackItems.projectSlug, projectSlug)
  ))

  return result.meta.changes === 1
}

export const toggleFeedbackVote = async (
  db: ObservatoryDb,
  projectSlug: string,
  itemId: string,
  voterHash: string,
  now: number
): Promise<{ hasVoted: boolean, voteCount: number } | null> => {
  const item = await db
    .select({ id: feedbackItems.id, voteCount: feedbackItems.voteCount })
    .from(feedbackItems)
    .where(and(
      eq(feedbackItems.id, itemId), eq(feedbackItems.projectSlug, projectSlug), eq(feedbackItems.type, 'idea'), eq(feedbackItems.moderationStatus, 'approved'), eq(feedbackItems.isPublic, true)
    ))
    .limit(1)
    .then(rows => rows[0] ?? null)

  if (!item) return null

  const existing = await db
    .select({ itemId: feedbackVotes.itemId })
    .from(feedbackVotes)
    .where(and(
      eq(feedbackVotes.itemId, itemId), eq(feedbackVotes.voterHash, voterHash)
    ))
    .limit(1)
    .then(rows => rows[0] ?? null)

  const hasVoted = !existing

  if (hasVoted) {
    await db.insert(feedbackVotes).values({
      createdAt: now,
      itemId,
      voterHash
    }).onConflictDoNothing()

    await db.update(feedbackItems).set({
      updatedAt: now,
      voteCount: sql`${feedbackItems.voteCount} + 1`
    }).where(eq(feedbackItems.id, itemId))
  } else {
    await db.delete(feedbackVotes).where(and(
      eq(feedbackVotes.itemId, itemId), eq(feedbackVotes.voterHash, voterHash)
    ))

    await db.update(feedbackItems).set({
      updatedAt: now,
      voteCount: sql`max(0, ${feedbackItems.voteCount} - 1)`
    }).where(eq(feedbackItems.id, itemId))
  }

  return {
    hasVoted,
    voteCount: Math.max(0, item.voteCount + (hasVoted ? 1 : -1))
  }
}

export const consumeFeedbackRateLimit = async (
  db: ObservatoryDb,
  values: {
    action: string
    keyHash: string
    limit: number
    windowStart: string
  }
): Promise<boolean> => {
  await db
    .insert(feedbackRateLimits)
    .values({
      action: values.action,
      keyHash: values.keyHash,
      requestCount: 1,
      windowStart: values.windowStart
    })
    .onConflictDoUpdate({
      set: { requestCount: sql`${feedbackRateLimits.requestCount} + 1` },
      target: [
        feedbackRateLimits.keyHash,
        feedbackRateLimits.action,
        feedbackRateLimits.windowStart
      ]
    })

  const rateLimitConditions = [
    eq(feedbackRateLimits.keyHash, values.keyHash),
    eq(feedbackRateLimits.action, values.action),
    eq(feedbackRateLimits.windowStart, values.windowStart)
  ]

  const count = await db
    .select({ requestCount: feedbackRateLimits.requestCount })
    .from(feedbackRateLimits)
    .where(and(...rateLimitConditions))
    .limit(1)
    .then(rows => rows[0]?.requestCount ?? values.limit + 1)

  return count <= values.limit
}

export const pruneFeedbackRateLimits = async (
  db: ObservatoryDb,
  before: string
): Promise<void> => {
  await db.delete(feedbackRateLimits).where(lt(
    feedbackRateLimits.windowStart, before
  ))
}

export const countRecentFailedAuthAttempts = async (
  db: ObservatoryDb,
  identity: string,
  since: number
): Promise<number> => {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(authAttempts)
    .where(and(
      eq(authAttempts.identity, identity), eq(authAttempts.succeeded, false), gt(authAttempts.createdAt, since)
    ))

  return result[0]?.count ?? 0
}

export const recordAuthAttempt = async (
  db: ObservatoryDb,
  values: typeof authAttempts.$inferInsert
): Promise<void> => {
  await db.insert(authAttempts).values(values)
}

export const insertPasskeyChallenge = async (
  db: ObservatoryDb,
  values: typeof passkeyChallenges.$inferInsert
): Promise<void> => {
  await db.insert(passkeyChallenges).values(values)
}

export const consumePasskeyChallenge = async (
  db: ObservatoryDb,
  values: {
    id: string
    now: number
    ownerEmail: string | null
    purpose: 'authentication' | 'registration'
  }
): Promise<string | null> => {
  const ownerCondition = values.ownerEmail === null ?
    isNull(passkeyChallenges.ownerEmail) :
    eq(passkeyChallenges.ownerEmail, values.ownerEmail)

  const matchingId = eq(passkeyChallenges.id, values.id)
  const matchingPurpose = eq(passkeyChallenges.purpose, values.purpose)
  const unused = isNull(passkeyChallenges.usedAt)
  const unexpired = gt(passkeyChallenges.expiresAt, values.now)

  const where = and(
    matchingId, matchingPurpose, ownerCondition, unused, unexpired
  )

  const rows = await db
    .select({ challenge: passkeyChallenges.challenge })
    .from(passkeyChallenges)
    .where(where)
    .limit(1)

  const row = rows[0]

  if (!row) return null

  const result = await db
    .update(passkeyChallenges)
    .set({ usedAt: values.now })
    .where(where)

  return result.meta.changes === 1 ? row.challenge : null
}

export const deleteExpiredPasskeyChallenges = async (
  db: ObservatoryDb,
  now: number
): Promise<void> => {
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, now))
}

export const listPasskeyCredentials = async (db: ObservatoryDb) => db
  .select()
  .from(passkeyCredentials)
  .orderBy(passkeyCredentials.createdAt)

export const findPasskeyCredential = async (
  db: ObservatoryDb,
  id: string
) => db
  .select()
  .from(passkeyCredentials)
  .where(eq(passkeyCredentials.id, id))
  .limit(1)
  .then(rows => rows[0] ?? null)

export const insertPasskeyCredential = async (
  db: ObservatoryDb,
  values: typeof passkeyCredentials.$inferInsert
): Promise<void> => {
  await db.insert(passkeyCredentials).values(values)
}

export const updatePasskeyCredential = async (
  db: ObservatoryDb,
  id: string,
  values: Partial<typeof passkeyCredentials.$inferInsert>
): Promise<void> => {
  await db.update(passkeyCredentials).set(values).where(eq(passkeyCredentials.id, id))
}

export const deletePasskeyCredential = async (
  db: ObservatoryDb,
  id: string
): Promise<boolean> => {
  const result = await db.delete(passkeyCredentials).where(eq(passkeyCredentials.id, id))

  return result.meta.changes === 1
}

export const insertAuthCode = async (
  db: ObservatoryDb,
  values: typeof authCodes.$inferInsert
): Promise<void> => {
  await db.insert(authCodes).values(values)
}

export const tryInsertAuthCodeRequest = async (
  db: ObservatoryDb,
  values: typeof authCodeRequests.$inferInsert,
  since: number,
  limit: number
): Promise<boolean> => {
  const result = await db.run(sql`
    INSERT INTO auth_code_requests (id, identity_hash, created_at, expires_at)
    SELECT ${values.id}, ${values.identityHash}, ${values.createdAt}, ${values.expiresAt}
    WHERE (
      SELECT count(*)
      FROM auth_code_requests
      WHERE identity_hash = ${values.identityHash}
        AND created_at > ${since}
    ) < ${limit}
  `)

  return result.meta.changes === 1
}

export const countRecentAuthCodes = async (
  db: ObservatoryDb,
  email: string,
  since: number
): Promise<number> => {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(authCodes)
    .where(and(eq(authCodes.email, email), gt(authCodes.createdAt, since)))

  return result[0]?.count ?? 0
}

export const findLatestUsableCode = async (
  db: ObservatoryDb,
  email: string,
  now: number
) => db
  .select()
  .from(authCodes)
  .where(
    and(
      eq(authCodes.email, email), isNull(authCodes.usedAt), gt(authCodes.expiresAt, now), lt(authCodes.attempts, 5)
    )
  )
  .orderBy(desc(authCodes.createdAt))
  .limit(1)
  .then(rows => rows[0] ?? null)

export const recordCodeAttempt = async (
  db: ObservatoryDb,
  id: string,
  usedAt?: number
): Promise<void> => {
  await db
    .update(authCodes)
    .set({
      attempts: sql`${authCodes.attempts} + 1`,
      ...(usedAt === undefined ? {} : { usedAt })
    })
    .where(eq(authCodes.id, id))
}

export const consumeAuthCode = async (
  db: ObservatoryDb,
  id: string,
  now: number
): Promise<boolean> => {
  const result = await db
    .update(authCodes)
    .set({
      attempts: sql`${authCodes.attempts} + 1`,
      usedAt: now
    })
    .where(and(
      eq(authCodes.id, id),
      isNull(authCodes.usedAt),
      gt(authCodes.expiresAt, now),
      lt(authCodes.attempts, 5)
    ))

  return result.meta.changes === 1
}

export const insertSession = async (
  db: ObservatoryDb,
  values: typeof sessions.$inferInsert
): Promise<void> => {
  await db.insert(sessions).values(values)
}

export const findSession = async (
  db: ObservatoryDb,
  tokenHash: string,
  now: number
) => db
  .select()
  .from(sessions)
  .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
  .limit(1)
  .then(rows => rows[0] ?? null)

export const deleteSession = async (
  db: ObservatoryDb,
  tokenHash: string
): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

export const cleanupExpiredAuth = async (
  db: ObservatoryDb,
  now: number
): Promise<void> => {
  await db.delete(authCodes).where(lt(authCodes.expiresAt, now))

  await db.delete(authCodeRequests).where(lt(authCodeRequests.expiresAt, now))

  await db.delete(sessions).where(lt(sessions.expiresAt, now))

  await db.delete(authAttempts).where(lt(authAttempts.createdAt, now - 86_400_000))

  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, now))
}

export const startSyncRun = async (
  db: ObservatoryDb,
  id: string,
  startedAt: number
): Promise<void> => {
  await db.insert(syncRuns).values({
    id,
    projectCount: 0,
    startedAt,
    status: 'running'
  })
}

export const completeSyncRun = async (
  db: ObservatoryDb,
  id: string,
  values: {
    completedAt: number
    errorMessage?: string
    projectCount: number
    status: string
  }
): Promise<void> => {
  await db
    .update(syncRuns)
    .set({
      completedAt: values.completedAt,
      errorMessage: values.errorMessage ?? null,
      projectCount: values.projectCount,
      status: values.status
    })
    .where(eq(syncRuns.id, id))
}

export const insertSnapshots = async (
  db: ObservatoryDb,
  snapshots: readonly SnapshotWrite[]
): Promise<void> => {
  // D1 enforces a low bound-variable limit per statement. One snapshot has 24
  // columns, so single-row writes remain safely below the limit at any catalog size.
  for (const snapshot of snapshots) {
    await db.insert(projectSnapshots).values({
      ...snapshot,
      npmPackages: JSON.stringify(snapshot.npmPackages),
      topics: JSON.stringify(snapshot.topics)
    })
  }
}

export const upsertNpmDownloads = async (
  db: ObservatoryDb,
  snapshots: readonly NpmDownloadWrite[]
): Promise<void> => {
  const batchSize = 15

  for (let index = 0; index < snapshots.length; index += batchSize) {
    const batch = snapshots.slice(index, index + batchSize)

    await db
      .insert(npmDownloadSnapshots)
      .values(batch)
      .onConflictDoUpdate({
        set: {
          collectedAt: sql`excluded.collected_at`,
          downloads: sql`excluded.downloads`,
          slug: sql`excluded.slug`
        },
        target: [
          npmDownloadSnapshots.packageName,
          npmDownloadSnapshots.periodStart
        ]
      })
  }
}

export const getLatestNpmDownloadDates = async (db: ObservatoryDb) => db
  .select({
    packageName: npmDownloadSnapshots.packageName,
    periodStart: max(npmDownloadSnapshots.periodStart)
  })
  .from(npmDownloadSnapshots)
  .groupBy(npmDownloadSnapshots.packageName)

export const getNpmDownloadsSince = async (db: ObservatoryDb, since: number) => db
  .select()
  .from(npmDownloadSnapshots)
  .where(gte(npmDownloadSnapshots.periodStart, since))
  .orderBy(npmDownloadSnapshots.periodStart)

export const insertVscodeExtensionSnapshots = async (
  db: ObservatoryDb,
  snapshots: readonly VscodeExtensionWrite[]
): Promise<void> => {
  for (const snapshot of snapshots)
    await db.insert(vscodeExtensionSnapshots).values(snapshot)
}

export const getVscodeExtensionSnapshotsSince = async (
  db: ObservatoryDb,
  since: number
) => db
  .select()
  .from(vscodeExtensionSnapshots)
  .where(gte(vscodeExtensionSnapshots.collectedAt, since))
  .orderBy(vscodeExtensionSnapshots.collectedAt)

export const insertReleaseAssetSnapshots = async (
  db: ObservatoryDb,
  snapshots: readonly ReleaseAssetWrite[]
): Promise<void> => {
  for (const snapshot of snapshots)
    await db.insert(releaseAssetSnapshots).values(snapshot)
}

export const getReleaseAssetSnapshotsSince = async (
  db: ObservatoryDb,
  since: number
) => db
  .select()
  .from(releaseAssetSnapshots)
  .where(gte(releaseAssetSnapshots.collectedAt, since))
  .orderBy(releaseAssetSnapshots.collectedAt)

export const getSnapshotsForSyncRun = async (
  db: ObservatoryDb,
  syncRunId: string
) => db
  .select()
  .from(projectSnapshots)
  .where(
    and(
      eq(projectSnapshots.visibility, 'public'), eq(projectSnapshots.syncRunId, syncRunId)
    )
  )
  .orderBy(desc(projectSnapshots.pushedAt))

export const getPublicSnapshotsSince = async (
  db: ObservatoryDb,
  since: number
) => db
  .select()
  .from(projectSnapshots)
  .where(
    and(
      eq(projectSnapshots.visibility, 'public'), gte(projectSnapshots.collectedAt, since)
    )
  )
  .orderBy(projectSnapshots.collectedAt)

export const getProjectPreferences = async (db: ObservatoryDb) => db.select().from(projectPreferences)

export const setProjectPreference = async (
  db: ObservatoryDb,
  slug: string,
  values: ProjectPreferenceWrite,
  updatedAt: number
): Promise<void> => {
  await db
    .insert(projectPreferences)
    .values({ ...values, slug, updatedAt })
    .onConflictDoUpdate({
      set: { ...values, updatedAt },
      target: projectPreferences.slug
    })
}

export const getLatestSyncRun = async (db: ObservatoryDb) => db
  .select()
  .from(syncRuns)
  .orderBy(desc(syncRuns.startedAt))
  .limit(1)
  .then(rows => rows[0] ?? null)

export const getLatestSuccessfulSyncRun = async (db: ObservatoryDb) => db
  .select()
  .from(syncRuns)
  .where(eq(syncRuns.status, 'succeeded'))
  .orderBy(desc(syncRuns.startedAt))
  .limit(1)
  .then(rows => rows[0] ?? null)

export const getAnalyticsWebsites = async (db: ObservatoryDb) => {
  const latestSync = await getLatestSuccessfulSyncRun(db)

  if (!latestSync) return []

  const [rows, preferences] = await Promise.all([
    getSnapshotsForSyncRun(db, latestSync.id),
    getProjectPreferences(db)
  ])

  const analyticsEnabledBySlug = new Map(
    preferences.map(preference => [
      preference.slug,
      preference.websiteAnalyticsEnabled
    ])
  )

  return rows.flatMap(row => {
    if (!row.websiteUrl || analyticsEnabledBySlug.get(row.slug) === false)
      return []

    try {
      return [{ hostname: new URL(row.websiteUrl).hostname, slug: row.slug }]
    } catch {
      return []
    }
  })
}

export const upsertWebsiteAnalytics = async (
  db: ObservatoryDb,
  snapshots: readonly WebsiteAnalyticsWrite[]
): Promise<void> => {
  for (const snapshot of snapshots) {
    await db
      .insert(websiteAnalyticsSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({
        set: {
          collectedAt: snapshot.collectedAt,
          hostname: snapshot.hostname,
          pageViews: snapshot.pageViews,
          periodEnd: snapshot.periodEnd,
          sampleInterval: snapshot.sampleInterval,
          visits: snapshot.visits
        },
        target: [
          websiteAnalyticsSnapshots.slug,
          websiteAnalyticsSnapshots.periodStart
        ]
      })
  }
}

export const getWebsiteAnalyticsSince = async (
  db: ObservatoryDb,
  since: number
) => db
  .select()
  .from(websiteAnalyticsSnapshots)
  .where(gte(websiteAnalyticsSnapshots.periodStart, since))
  .orderBy(websiteAnalyticsSnapshots.periodStart)

export const upsertStoreMetrics = async (
  db: ObservatoryDb,
  points: readonly StoreMetricWrite[]
): Promise<void> => {
  // A store metric binds every table column. D1 accepts at most 100 bound
  // parameters per statement, so this is the largest safe batch.
  const batchSize = Math.floor(100 / storeMetricWriteColumnCount)

  for (let index = 0; index < points.length; index += batchSize) {
    const batch = points.slice(index, index + batchSize)

    if (batch.length === 0) continue

    await db.insert(storeMetricPoints).values(batch).onConflictDoUpdate({
      set: {
        collectedAt: sql`excluded.collected_at`,
        source: sql`excluded.source`,
        value: sql`excluded.value`
      },
      target: [
        storeMetricPoints.appSlug,
        storeMetricPoints.provider,
        storeMetricPoints.periodStart,
        storeMetricPoints.metric,
        storeMetricPoints.dimension,
        storeMetricPoints.dimensionValue
      ]
    })
  }
}

export const insertStoreSyncRun = async (
  db: ObservatoryDb,
  run: StoreSyncRunWrite
): Promise<void> => {
  await db.insert(storeSyncRuns).values(run)
}

export const getStoreMetricsSince = async (
  db: ObservatoryDb,
  since: number
) => db
  .select()
  .from(storeMetricPoints)
  .where(gte(storeMetricPoints.periodStart, since))
  .orderBy(storeMetricPoints.periodStart)

export const getLatestStoreSyncRuns = async (db: ObservatoryDb) => db
  .select()
  .from(storeSyncRuns)
  .orderBy(desc(storeSyncRuns.startedAt))
