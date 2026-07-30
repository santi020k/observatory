import { and, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'

import {
  authCodes,
  projectPreferences,
  projectSnapshots,
  sessions,
  syncRuns,
  websiteAnalyticsSnapshots,
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

export interface ProjectPreferenceWrite {
  attentionMode?: 'all' | 'health' | 'off'
  enabled?: boolean
  pinned?: boolean
  websiteAnalyticsEnabled?: boolean
}

export const createDb = (client: D1Database) => drizzle(client)

export const insertAuthCode = async (
  db: ObservatoryDb,
  values: typeof authCodes.$inferInsert,
): Promise<void> => {
  await db.insert(authCodes).values(values)
}

export const countRecentAuthCodes = async (
  db: ObservatoryDb,
  email: string,
  since: number,
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
  now: number,
) =>
  db
    .select()
    .from(authCodes)
    .where(
      and(
        eq(authCodes.email, email),
        isNull(authCodes.usedAt),
        gt(authCodes.expiresAt, now),
        lt(authCodes.attempts, 5),
      ),
    )
    .orderBy(desc(authCodes.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)

export const recordCodeAttempt = async (
  db: ObservatoryDb,
  id: string,
  usedAt?: number,
): Promise<void> => {
  await db
    .update(authCodes)
    .set({
      attempts: sql`${authCodes.attempts} + 1`,
      ...(usedAt === undefined ? {} : { usedAt }),
    })
    .where(eq(authCodes.id, id))
}

export const insertSession = async (
  db: ObservatoryDb,
  values: typeof sessions.$inferInsert,
): Promise<void> => {
  await db.insert(sessions).values(values)
}

export const findSession = async (
  db: ObservatoryDb,
  tokenHash: string,
  now: number,
) =>
  db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1)
    .then((rows) => rows[0] ?? null)

export const deleteSession = async (
  db: ObservatoryDb,
  tokenHash: string,
): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
}

export const cleanupExpiredAuth = async (
  db: ObservatoryDb,
  now: number,
): Promise<void> => {
  await db.delete(authCodes).where(lt(authCodes.expiresAt, now))

  await db.delete(sessions).where(lt(sessions.expiresAt, now))
}

export const startSyncRun = async (
  db: ObservatoryDb,
  id: string,
  startedAt: number,
): Promise<void> => {
  await db.insert(syncRuns).values({
    id,
    projectCount: 0,
    startedAt,
    status: 'running',
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
  },
): Promise<void> => {
  await db
    .update(syncRuns)
    .set({
      completedAt: values.completedAt,
      errorMessage: values.errorMessage ?? null,
      projectCount: values.projectCount,
      status: values.status,
    })
    .where(eq(syncRuns.id, id))
}

export const insertSnapshots = async (
  db: ObservatoryDb,
  snapshots: readonly SnapshotWrite[],
): Promise<void> => {
  // D1 enforces a low bound-variable limit per statement. One snapshot has 24
  // columns, so single-row writes remain safely below the limit at any catalog size.
  for (const snapshot of snapshots) {
    await db.insert(projectSnapshots).values({
      ...snapshot,
      npmPackages: JSON.stringify(snapshot.npmPackages),
      topics: JSON.stringify(snapshot.topics),
    })
  }
}

export const getSnapshotsForSyncRun = async (
  db: ObservatoryDb,
  syncRunId: string,
) =>
  db
    .select()
    .from(projectSnapshots)
    .where(
      and(
        eq(projectSnapshots.visibility, 'public'),
        eq(projectSnapshots.syncRunId, syncRunId),
      ),
    )
    .orderBy(desc(projectSnapshots.pushedAt))

export const getPublicSnapshotsSince = async (
  db: ObservatoryDb,
  since: number,
) =>
  db
    .select()
    .from(projectSnapshots)
    .where(
      and(
        eq(projectSnapshots.visibility, 'public'),
        gte(projectSnapshots.collectedAt, since),
      ),
    )
    .orderBy(projectSnapshots.collectedAt)

export const getProjectPreferences = async (db: ObservatoryDb) =>
  db.select().from(projectPreferences)

export const setProjectPreference = async (
  db: ObservatoryDb,
  slug: string,
  values: ProjectPreferenceWrite,
  updatedAt: number,
): Promise<void> => {
  await db
    .insert(projectPreferences)
    .values({ ...values, slug, updatedAt })
    .onConflictDoUpdate({
      set: { ...values, updatedAt },
      target: projectPreferences.slug,
    })
}

export const getLatestSyncRun = async (db: ObservatoryDb) =>
  db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)

export const getLatestSuccessfulSyncRun = async (db: ObservatoryDb) =>
  db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.status, 'succeeded'))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)

export const getAnalyticsWebsites = async (db: ObservatoryDb) => {
  const latestSync = await getLatestSuccessfulSyncRun(db)

  if (!latestSync) return []

  const [rows, preferences] = await Promise.all([
    getSnapshotsForSyncRun(db, latestSync.id),
    getProjectPreferences(db),
  ])

  const analyticsEnabledBySlug = new Map(
    preferences.map((preference) => [
      preference.slug,
      preference.websiteAnalyticsEnabled,
    ]),
  )

  return rows.flatMap((row) => {
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
  snapshots: readonly WebsiteAnalyticsWrite[],
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
          visits: snapshot.visits,
        },
        target: [
          websiteAnalyticsSnapshots.slug,
          websiteAnalyticsSnapshots.periodStart,
        ],
      })
  }
}

export const getWebsiteAnalyticsSince = async (
  db: ObservatoryDb,
  since: number,
) =>
  db
    .select()
    .from(websiteAnalyticsSnapshots)
    .where(gte(websiteAnalyticsSnapshots.periodStart, since))
    .orderBy(websiteAnalyticsSnapshots.periodStart)
