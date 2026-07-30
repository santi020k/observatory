import {
  type AnalyticsRange,
  type Dashboard,
  dashboardSchema,
  type ProjectDashboard,
  projectDashboardSchema,
  type ProjectMetric,
  type ProjectSettings,
  projectSettingsSchema
} from '@santi020k/observatory-api-types'
import {
  createDb,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getNpmDownloadsSince,
  getProjectPreferences,
  getPublicSnapshotsSince,
  getSnapshotsForSyncRun
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

import { buildWebsiteAnalytics } from './cloudflare'

type Snapshot = Awaited<ReturnType<typeof getSnapshotsForSyncRun>>[number]
type NpmDownloadSnapshot = Awaited<
  ReturnType<typeof getNpmDownloadsSince>
>[number]

type ProjectPreference = Pick<
  ProjectMetric,
  'attentionMode' | 'pinned' | 'websiteAnalyticsEnabled'
>

const defaultProjectPreference: ProjectPreference = {
  attentionMode: 'all',
  pinned: false,
  websiteAnalyticsEnabled: true
}

const compareProjectRelevance = (
  left: { name: string, pinned?: boolean, relevanceScore: number },
  right: { name: string, pinned?: boolean, relevanceScore: number }
): number => Number(right.pinned ?? false) - Number(left.pinned ?? false) ||
  right.relevanceScore - left.relevanceScore ||
  left.name.localeCompare(right.name)

const getRangeMilliseconds = (range: AnalyticsRange): number => {
  if (range === '5d') return 5 * 24 * 60 * 60 * 1_000

  if (range === '30d') return 30 * 24 * 60 * 60 * 1_000

  if (range === '90d') return 90 * 24 * 60 * 60 * 1_000

  if (range === 'ytd') {
    const now = new Date()

    return Date.now() - Date.UTC(now.getUTCFullYear(), 0, 1)
  }

  if (range === '1y') return 365 * 24 * 60 * 60 * 1_000

  return 5 * 365 * 24 * 60 * 60 * 1_000
}

const parseStringArray = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value)

    return Array.isArray(parsed) &&
      parsed.every(item => typeof item === 'string') ?
      parsed :
      []
  } catch {
    return []
  }
}

const toProjectMetric = (
  row: Snapshot,
  preference: ProjectPreference
): ProjectMetric => ({
  attentionMode: preference.attentionMode,
  archived: row.archived,
  category: row.category as ProjectMetric['category'],
  description: row.description,
  forks: row.forks,
  githubClones14d: row.githubClones14d,
  githubViews14d: row.githubViews14d,
  healthStatus: row.healthStatus as ProjectMetric['healthStatus'],
  latestVersion: row.latestVersion,
  name: row.name,
  npmDownloads30d: row.npmDownloads30d,
  openIssues: row.openIssues,
  pinned: preference.pinned,
  pushedAt: row.pushedAt,
  relevanceScore: row.relevanceScore,
  responseTimeMs: row.responseTimeMs,
  slug: row.slug,
  sources: {
    github: row.repositoryUrl,
    npm: parseStringArray(row.npmPackages),
    website: row.websiteUrl
  },
  stars: row.stars,
  status: row.status as ProjectMetric['status'],
  topics: parseStringArray(row.topics),
  visibility: row.visibility as ProjectMetric['visibility'],
  websiteAnalyticsEnabled: preference.websiteAnalyticsEnabled
})

const sumNullable = (values: readonly (number | null)[]): number | null => {
  const available = values.filter((value): value is number => value !== null)

  return available.length > 0 ?
    available.reduce((total, value) => total + value, 0) :
    null
}

const getBucketStart = (timestamp: number, range: AnalyticsRange): number => {
  if (range === '5y') {
    const date = new Date(timestamp)

    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  }

  let bucketMilliseconds: number

  switch (range) {
    case '5d':
      bucketMilliseconds = 6 * 60 * 60 * 1_000

      break

    case '30d':
      bucketMilliseconds = 24 * 60 * 60 * 1_000

      break

    case '90d':
      bucketMilliseconds = 7 * 24 * 60 * 60 * 1_000

      break

    default:
      bucketMilliseconds = 7 * 24 * 60 * 60 * 1_000
  }

  return Math.floor(timestamp / bucketMilliseconds) * bucketMilliseconds
}

const buildHistory = (rows: Snapshot[], range: AnalyticsRange) => {
  const buckets = new Map<number, Map<string, Snapshot>>()

  for (const row of rows) {
    const bucketStart = getBucketStart(row.collectedAt, range)
    const bucket = buckets.get(bucketStart) ?? new Map<string, Snapshot>()
    const current = bucket.get(row.slug)

    if (!current || current.collectedAt < row.collectedAt)
      bucket.set(row.slug, row)

    buckets.set(bucketStart, bucket)
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketStart, snapshotsBySlug]) => {
      const snapshots = [...snapshotsBySlug.values()]

      return {
        collectedAt: new Date(
          Math.max(
            bucketStart, ...snapshots.map(snapshot => snapshot.collectedAt)
          )
        ).toISOString(),
        githubViews14d: sumNullable(
          snapshots.map(snapshot => snapshot.githubViews14d)
        ),
        npmDownloads30d: snapshots.reduce(
          (total, snapshot) => total + snapshot.npmDownloads30d, 0
        ),
        openIssues: snapshots.reduce(
          (total, snapshot) => total + snapshot.openIssues, 0
        ),
        stars: snapshots.reduce((total, snapshot) => total + snapshot.stars, 0)
      }
    })
}

const buildRawHistory = (rows: Snapshot[]) => {
  const snapshotsByCollection = new Map<number, Snapshot[]>()

  for (const row of rows) {
    const snapshots = snapshotsByCollection.get(row.collectedAt) ?? []

    snapshots.push(row)

    snapshotsByCollection.set(row.collectedAt, snapshots)
  }

  return [...snapshotsByCollection.entries()]
    .sort(([left], [right]) => left - right)
    .map(([collectedAt, snapshots]) => ({
      collectedAt: new Date(collectedAt).toISOString(),
      githubViews14d: sumNullable(
        snapshots.map(snapshot => snapshot.githubViews14d)
      ),
      npmDownloads30d: snapshots.reduce(
        (total, snapshot) => total + snapshot.npmDownloads30d, 0
      ),
      openIssues: snapshots.reduce(
        (total, snapshot) => total + snapshot.openIssues, 0
      ),
      stars: snapshots.reduce(
        (total, snapshot) => total + snapshot.stars, 0
      )
    }))
}

const getHistoryChange = <T>(
  first: T | undefined,
  last: T | undefined,
  select: (value: T) => number
): number => first && last ? select(last) - select(first) : 0

const getPeriodSummary = (rows: Snapshot[]) => {
  const history = buildRawHistory(rows)
  const first = history[0]
  const last = history[history.length - 1]

  return {
    availableFrom: first?.collectedAt ?? null,
    availableTo: last?.collectedAt ?? null,
    downloadVelocityChange: getHistoryChange(
      first, last, value => value.npmDownloads30d
    ),
    issueChange: getHistoryChange(first, last, value => value.openIssues),
    starsGained: getHistoryChange(first, last, value => value.stars),
    syncs: history.length
  }
}

type NpmBucket = 'day' | 'month' | 'week' | 'year'

const getNpmBucketStart = (
  timestamp: number,
  bucket: NpmBucket
): number => {
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  if (bucket === 'year') return Date.UTC(year, 0, 1)

  if (bucket === 'month') return Date.UTC(year, month, 1)

  if (bucket === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7

    return Date.UTC(year, month, day - mondayOffset)
  }

  return Date.UTC(year, month, day)
}

const aggregateNpmDownloads = (
  rows: readonly NpmDownloadSnapshot[],
  bucket: NpmBucket
) => {
  const downloadsByPeriod = new Map<number, number>()

  for (const row of rows) {
    const periodStart = getNpmBucketStart(row.periodStart, bucket)

    downloadsByPeriod.set(
      periodStart, (downloadsByPeriod.get(periodStart) ?? 0) + row.downloads
    )
  }

  return [...downloadsByPeriod.entries()]
    .sort(([left], [right]) => left - right)
    .map(([periodStart, downloads]) => ({
      downloads,
      periodStart: new Date(periodStart).toISOString()
    }))
}

export const buildNpmAnalytics = (
  rows: readonly NpmDownloadSnapshot[]
) => {
  const sortedRows = [...rows].sort(
    (left, right) => left.periodStart - right.periodStart
  )
  const downloadsByPackage = new Map<
    string,
    { downloads: number, packageName: string, slug: string }
  >()

  for (const row of sortedRows) {
    const key = `${row.slug}\0${row.packageName}`
    const current = downloadsByPackage.get(key)

    downloadsByPackage.set(key, {
      downloads: (current?.downloads ?? 0) + row.downloads,
      packageName: row.packageName,
      slug: row.slug
    })
  }

  const packages = [...downloadsByPackage.values()].sort(
    (left, right) => right.downloads - left.downloads ||
      left.packageName.localeCompare(right.packageName)
  )

  return {
    availableFrom:
      sortedRows[0] ?
        new Date(sortedRows[0].periodStart).toISOString() :
        null,
    availableTo:
      sortedRows.at(-1) ?
        new Date(sortedRows.at(-1)?.periodStart ?? 0).toISOString() :
        null,
    daily: aggregateNpmDownloads(sortedRows, 'day'),
    monthly: aggregateNpmDownloads(sortedRows, 'month'),
    packages,
    totalDownloads: packages.reduce(
      (total, packageDownloads) => total + packageDownloads.downloads, 0
    ),
    weekly: aggregateNpmDownloads(sortedRows, 'week'),
    yearly: aggregateNpmDownloads(sortedRows, 'year')
  }
}

const toSyncState = (
  sync: Awaited<ReturnType<typeof getLatestSyncRun>>,
  latestSuccessfulSync: Awaited<ReturnType<typeof getLatestSuccessfulSyncRun>>
) => ({
  completedAt: latestSuccessfulSync?.completedAt ?
    new Date(latestSuccessfulSync.completedAt).toISOString() :
    null,
  status: sync?.status ?? 'idle'
})

const getDashboardRows = async (env: Bindings, range: AnalyticsRange) => {
  const database = createDb(env.DB)

  const [sync, latestSuccessfulSync, preferences] = await Promise.all([
    getLatestSyncRun(database),
    getLatestSuccessfulSyncRun(database),
    getProjectPreferences(database)
  ])

  const preferencesBySlug = new Map(
    preferences.map(preference => [preference.slug, preference])
  )

  const getPreference = (slug: string) => {
    const preference = preferencesBySlug.get(slug)

    return {
      attentionMode:
        preference?.attentionMode === 'health' ||
        preference?.attentionMode === 'off' ?
          preference.attentionMode :
          'all',
      pinned: preference?.pinned ?? false,
      websiteAnalyticsEnabled: preference?.websiteAnalyticsEnabled ?? true
    } satisfies ProjectPreference
  }

  const isEnabled = (slug: string) => preferencesBySlug.get(slug)?.enabled !== false

  const since = Date.now() - getRangeMilliseconds(range)
  const [latestRows, historyRows, npmDownloadRows] = await Promise.all([
    latestSuccessfulSync ?
      getSnapshotsForSyncRun(database, latestSuccessfulSync.id) :
      Promise.resolve([]),
    getPublicSnapshotsSince(database, since),
    getNpmDownloadsSince(database, since)
  ])

  return {
    historyRows: historyRows.filter(row => isEnabled(row.slug)),
    getPreference,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    npmDownloadRows: npmDownloadRows.filter(row => isEnabled(row.slug)),
    sync
  }
}

export const buildDashboard = async (
  env: Bindings,
  range: AnalyticsRange = '30d'
): Promise<Dashboard> => {
  const {
    getPreference,
    historyRows,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    npmDownloadRows,
    sync
  } = await getDashboardRows(env, range)

  const projects = latestRows
    .filter(row => isEnabled(row.slug))
    .map(row => toProjectMetric(row, getPreference(row.slug)))
    .sort(compareProjectRelevance)

  const history = buildHistory(historyRows, range)

  return dashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    history,
    npmAnalytics: buildNpmAnalytics(npmDownloadRows),
    period: getPeriodSummary(historyRows),
    projects,
    range,
    summary: {
      activeProjects: projects.filter(project => project.status === 'active')
        .length,
      githubClones14d: sumNullable(
        projects.map(project => project.githubClones14d)
      ),
      githubViews14d: sumNullable(
        projects.map(project => project.githubViews14d)
      ),
      npmDownloads30d: projects.reduce(
        (total, project) => total + project.npmDownloads30d, 0
      ),
      openIssues: projects.reduce(
        (total, project) => total + project.openIssues, 0
      ),
      publicProjects: projects.length
    },
    sync: toSyncState(sync, latestSuccessfulSync)
  })
}

export const buildProjectDashboard = async (
  env: Bindings,
  slug: string,
  range: AnalyticsRange = '30d'
): Promise<ProjectDashboard | null> => {
  const {
    getPreference,
    historyRows,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    sync
  } = await getDashboardRows(env, range)

  const row = latestRows.find(candidate => candidate.slug === slug)

  if (!row || !isEnabled(slug)) return null

  const preference = getPreference(slug)

  const projectHistoryRows = historyRows.filter(
    snapshot => snapshot.slug === slug
  )

  const history = buildHistory(projectHistoryRows, range)

  const websiteAnalytics =
    row.websiteUrl && preference.websiteAnalyticsEnabled ?
      ((await buildWebsiteAnalytics(env, range)).sites.find(
        site => site.slug === slug
      ) ?? null) :
      null

  return projectDashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    history,
    period: getPeriodSummary(projectHistoryRows),
    project: toProjectMetric(row, preference),
    range,
    sync: toSyncState(sync, latestSuccessfulSync),
    websiteAnalytics
  })
}

export const buildProjectSettings = async (
  env: Bindings
): Promise<ProjectSettings> => {
  const database = createDb(env.DB)

  const [latestSuccessfulSync, sync, preferences] = await Promise.all([
    getLatestSuccessfulSyncRun(database),
    getLatestSyncRun(database),
    getProjectPreferences(database)
  ])

  const rows = latestSuccessfulSync ?
    await getSnapshotsForSyncRun(database, latestSuccessfulSync.id) :
    []

  const preferencesBySlug = new Map(
    preferences.map(preference => [preference.slug, preference])
  )

  const projects = rows.map(row => {
    const preference = preferencesBySlug.get(row.slug)

    const attentionMode =
      preference?.attentionMode === 'health' ||
      preference?.attentionMode === 'off' ?
        preference.attentionMode :
        defaultProjectPreference.attentionMode

    return {
      attentionMode,
      category: row.category,
      enabled: preference?.enabled !== false,
      hasWebsite: row.websiteUrl !== null,
      name: row.name,
      pinned: preference?.pinned ?? false,
      relevanceScore: row.relevanceScore,
      slug: row.slug,
      status: row.status as ProjectSettings['projects'][number]['status'],
      websiteAnalyticsEnabled:
          preference?.websiteAnalyticsEnabled ?? true
    }
  })

  return projectSettingsSchema.parse({
    projects: projects.sort(compareProjectRelevance),
    sync: toSyncState(sync, latestSuccessfulSync)
  })
}
