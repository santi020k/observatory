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
  getCanonicalProjectSlug,
  getCatalogOverride
} from '@santi020k/observatory-catalog'
import {
  createDb,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getNpmDownloadsSince,
  getProjectPreferences,
  getPublicSnapshotsSince,
  getReleaseAssetSnapshotsSince,
  getSnapshotsForSyncRun,
  getVscodeExtensionSnapshotsSince
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

import { buildWebsiteAnalytics } from './cloudflare'

type Snapshot = Awaited<ReturnType<typeof getSnapshotsForSyncRun>>[number]

type NpmDownloadSnapshot = Awaited<
  ReturnType<typeof getNpmDownloadsSince>
>[number]

type VscodeExtensionSnapshot = Awaited<
  ReturnType<typeof getVscodeExtensionSnapshotsSince>
>[number]

type ReleaseAssetSnapshot = Awaited<
  ReturnType<typeof getReleaseAssetSnapshotsSince>
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

const getNpmRangeStart = (
  range: AnalyticsRange,
  now: number = Date.now()
): number => {
  const date = new Date(now)

  const todayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )

  if (range === 'ytd') return Date.UTC(date.getUTCFullYear(), 0, 1)

  return todayStart - getRangeMilliseconds(range)
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
    openVsx: (getCatalogOverride(row.slug)?.vscodeExtensions ?? []).map(
      extensionId => {
        const extensionParts = extensionId.split('.', 2)
        const namespace = extensionParts[0] ?? 'santi020k'
        const name = extensionParts[1] ?? extensionId

        return `https://open-vsx.org/extension/${namespace}/${name}`
      }
    ),
    vscode: (getCatalogOverride(row.slug)?.vscodeExtensions ?? []).map(
      extensionId => `https://marketplace.visualstudio.com/items?itemName=${extensionId}`
    ),
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
  const date = new Date(timestamp)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()

  if (range === '5y') return Date.UTC(year, month, 1)

  if (range === '30d') return Date.UTC(year, month, day)

  if (range !== '5d') {
    const mondayOffset = (date.getUTCDay() + 6) % 7

    return Date.UTC(year, month, day - mondayOffset)
  }

  const sixHours = 6 * 60 * 60 * 1_000

  return Math.floor(timestamp / sixHours) * sixHours
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
            bucketStart,
            ...snapshots.map(snapshot => snapshot.collectedAt)
          )
        ).toISOString(),
        githubViews14d: sumNullable(
          snapshots.map(snapshot => snapshot.githubViews14d)
        ),
        npmDownloads30d: snapshots.reduce(
          (total, snapshot) => total + snapshot.npmDownloads30d,
          0
        ),
        openIssues: snapshots.reduce(
          (total, snapshot) => total + snapshot.openIssues,
          0
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
        (total, snapshot) => total + snapshot.npmDownloads30d,
        0
      ),
      openIssues: snapshots.reduce(
        (total, snapshot) => total + snapshot.openIssues,
        0
      ),
      stars: snapshots.reduce((total, snapshot) => total + snapshot.stars, 0)
    }))
}

const getHistoryChange = <T>(
  first: T | undefined,
  last: T | undefined,
  select: (value: T) => number
): number => (first && last ? select(last) - select(first) : 0)

const getPeriodSummary = (rows: Snapshot[]) => {
  const history = buildRawHistory(rows)
  const first = history[0]
  const last = history[history.length - 1]

  return {
    availableFrom: first?.collectedAt ?? null,
    availableTo: last?.collectedAt ?? null,
    downloadVelocityChange: getHistoryChange(
      first,
      last,
      value => value.npmDownloads30d
    ),
    issueChange: getHistoryChange(first, last, value => value.openIssues),
    starsGained: getHistoryChange(first, last, value => value.stars),
    syncs: history.length
  }
}

interface HealthObservation {
  collectedAt: number
  responseTimeMs: number | null
  status: 'degraded' | 'healthy'
}

const availabilityTarget = 99.9

const toHealthObservations = (rows: readonly Snapshot[]) => rows
  .flatMap((row): HealthObservation[] => {
    if (row.healthStatus !== 'degraded' && row.healthStatus !== 'healthy')
      return []

    return [{
      collectedAt: row.collectedAt,
      responseTimeMs: row.responseTimeMs,
      status: row.healthStatus
    }]
  })
  .sort((left, right) => left.collectedAt - right.collectedAt)

const getPercentile = (
  values: readonly number[],
  percentile: number
): number | null => {
  if (values.length === 0) return null

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1)

  return sorted[index] ?? null
}

const getIncidentState = (observations: readonly HealthObservation[]) => {
  let consecutiveFailures = 0
  let lastOutageStartedAt: number | null = null
  let lastRecoveredAt: number | null = null
  let previousStatus: HealthObservation['status'] | null = null

  for (const observation of observations) {
    if (observation.status === 'degraded') {
      consecutiveFailures += 1

      if (previousStatus !== 'degraded')
        lastOutageStartedAt = observation.collectedAt
    } else {
      if (previousStatus === 'degraded')
        lastRecoveredAt = observation.collectedAt

      consecutiveFailures = 0
    }

    previousStatus = observation.status
  }

  return { consecutiveFailures, lastOutageStartedAt, lastRecoveredAt }
}

export const buildOperationalHealth = (
  rows: readonly Snapshot[],
  slug: string
) => {
  const observations = toHealthObservations(rows)

  const healthyChecks = observations.filter(
    observation => observation.status === 'healthy'
  ).length

  const failedChecks = observations.length - healthyChecks

  const availability = observations.length === 0 ?
    null :
    (healthyChecks / observations.length) * 100

  const availabilityPercent = availability === null ?
    null :
    Math.round(availability * 100) / 100

  const latencyValues = observations.flatMap(
    observation => observation.responseTimeMs === null ?
      [] :
      [observation.responseTimeMs]
  )

  const latest = observations[observations.length - 1]
  const incidents = getIncidentState(observations)

  return {
    availabilityPercent,
    availabilityTarget,
    consecutiveFailures: incidents.consecutiveFailures,
    currentStatus: latest?.status ?? 'unknown',
    failedChecks,
    healthyChecks,
    lastCheckedAt: latest ? new Date(latest.collectedAt).toISOString() : null,
    lastOutageStartedAt: incidents.lastOutageStartedAt === null ?
      null :
      new Date(incidents.lastOutageStartedAt).toISOString(),
    lastRecoveredAt: incidents.lastRecoveredAt === null ?
      null :
      new Date(incidents.lastRecoveredAt).toISOString(),
    latencyP50Ms: getPercentile(latencyValues, 0.5),
    latencyP95Ms: getPercentile(latencyValues, 0.95),
    meetsTarget: availability === null ?
      null :
      availability >= availabilityTarget,
    observations: observations.length,
    slug
  }
}

const buildPortfolioOperationalHealth = (
  rows: readonly Snapshot[],
  projects: readonly ProjectMetric[]
) => projects
  .filter(project => project.sources.website !== null)
  .map(project => buildOperationalHealth(
    rows.filter(row => row.slug === project.slug),
    project.slug
  ))

const getDownloadVelocityPercent = (
  first: Snapshot | undefined,
  last: Snapshot | undefined
): number | null => {
  if (!first || !last || first.npmDownloads30d === 0) return null

  return (
    Math.round(
      ((last.npmDownloads30d - first.npmDownloads30d) / first.npmDownloads30d) *
      1_000
    ) / 10
  )
}

const sampleGrowthTrend = (
  values: readonly number[],
  maximumPoints = 24
): number[] => {
  if (values.length <= maximumPoints) return [...values]

  return Array.from({ length: maximumPoints }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (values.length - 1)) / (maximumPoints - 1)
    )

    return values[sourceIndex] ?? 0
  })
}

const getProjectGrowth = (rows: Snapshot[], projects: ProjectMetric[]) => {
  const projectSlugs = new Set(projects.map(project => project.slug))
  const rowsBySlug = new Map<string, Snapshot[]>()

  for (const row of rows) {
    if (!projectSlugs.has(row.slug)) continue

    const projectRows = rowsBySlug.get(row.slug) ?? []

    projectRows.push(row)

    rowsBySlug.set(row.slug, projectRows)
  }

  return projects.map(project => {
    const projectRows = (rowsBySlug.get(project.slug) ?? []).sort(
      (left, right) => left.collectedAt - right.collectedAt
    )

    const first = projectRows[0]
    const last = projectRows[projectRows.length - 1]

    const downloadVelocityChange = getHistoryChange(
      first,
      last,
      value => value.npmDownloads30d
    )

    const downloadVelocityPercent = getDownloadVelocityPercent(first, last)
    const starsGained = getHistoryChange(first, last, value => value.stars)

    let signal:
      'accelerating' | 'growing' | 'insufficient' | 'slowing' | 'steady' =
        'steady'

    if (projectRows.length < 2) signal = 'insufficient'
    else if (downloadVelocityPercent !== null && downloadVelocityPercent >= 10)
      signal = 'accelerating'
    else if (downloadVelocityChange < 0) signal = 'slowing'
    else if (downloadVelocityChange > 0 || starsGained > 0) signal = 'growing'

    return {
      availableFrom: first ? new Date(first.collectedAt).toISOString() : null,
      availableTo: last ? new Date(last.collectedAt).toISOString() : null,
      downloadVelocityChange,
      downloadVelocityPercent,
      issueChange: getHistoryChange(first, last, value => value.openIssues),
      npmDownloads30dTrend: sampleGrowthTrend(
        projectRows.map(row => row.npmDownloads30d)
      ),
      observations: projectRows.length,
      signal,
      slug: project.slug,
      starsGained
    }
  })
}

type NpmBucket = 'day' | 'month' | 'week' | 'year'

const averageDownloads = (downloads: readonly number[]): number => {
  if (downloads.length === 0) return 0

  return Math.round(
    downloads.reduce((total, value) => total + value, 0) / downloads.length
  )
}

const getNpmBucketStart = (timestamp: number, bucket: NpmBucket): number => {
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
  const downloadsByPeriod = new Map<number, Map<string, Map<string, number>>>()

  for (const row of rows) {
    const periodStart = getNpmBucketStart(row.periodStart, bucket)

    const downloadsByProject =
      downloadsByPeriod.get(periodStart) ??
      new Map<string, Map<string, number>>()

    const downloadsByPackage =
      downloadsByProject.get(row.slug) ?? new Map<string, number>()

    downloadsByPackage.set(
      row.packageName,
      (downloadsByPackage.get(row.packageName) ?? 0) + row.downloads
    )

    downloadsByProject.set(row.slug, downloadsByPackage)

    downloadsByPeriod.set(periodStart, downloadsByProject)
  }

  return [...downloadsByPeriod.entries()]
    .sort(([left], [right]) => left - right)
    .map(([periodStart, downloadsByProject]) => ({
      downloads: [...downloadsByProject.values()].reduce(
        (portfolioTotal, downloadsByPackage) => {
          const projectAverage = averageDownloads([
            ...downloadsByPackage.values()
          ])

          return portfolioTotal + projectAverage
        },
        0
      ),
      periodStart: new Date(periodStart).toISOString()
    }))
}

export const buildNpmAnalytics = (rows: readonly NpmDownloadSnapshot[]) => {
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

  const lastRow = sortedRows[sortedRows.length - 1]
  const packageDownloadsByProject = new Map<string, number[]>()

  for (const packageDownloads of packages) {
    const projectDownloads =
      packageDownloadsByProject.get(packageDownloads.slug) ?? []

    projectDownloads.push(packageDownloads.downloads)

    packageDownloadsByProject.set(packageDownloads.slug, projectDownloads)
  }

  const totalDownloads = [...packageDownloadsByProject.values()].reduce(
    (portfolioTotal, projectDownloads) => portfolioTotal + averageDownloads(projectDownloads),
    0
  )

  return {
    availableFrom: sortedRows[0] ?
      new Date(sortedRows[0].periodStart).toISOString() :
      null,
    availableTo: lastRow ? new Date(lastRow.periodStart).toISOString() : null,
    daily: aggregateNpmDownloads(sortedRows, 'day'),
    monthly: aggregateNpmDownloads(sortedRows, 'month'),
    packages,
    totalDownloads,
    weekly: aggregateNpmDownloads(sortedRows, 'week'),
    yearly: aggregateNpmDownloads(sortedRows, 'year')
  }
}

const getLatestReleaseAssets = (
  rows: readonly ReleaseAssetSnapshot[]
): ReleaseAssetSnapshot[] => {
  const latestByAsset = new Map<string, ReleaseAssetSnapshot>()

  for (const row of rows) {
    const current = latestByAsset.get(row.assetId)

    if (!current || current.collectedAt < row.collectedAt)
      latestByAsset.set(row.assetId, row)
  }

  return [...latestByAsset.values()]
}

const buildReleaseHistory = (rows: readonly ReleaseAssetSnapshot[]) => {
  const downloadsByCollection = new Map<number, number>()

  for (const row of rows)
    downloadsByCollection.set(
      row.collectedAt,
      (downloadsByCollection.get(row.collectedAt) ?? 0) + row.downloads
    )

  return [...downloadsByCollection.entries()]
    .sort(([left], [right]) => left - right)
    .map(([collectedAt, downloads]) => ({
      collectedAt: new Date(collectedAt).toISOString(),
      downloads
    }))
}

const buildReleaseChannels = (
  assets: readonly { channel: string, downloads: number }[]
) => {
  const downloadsByChannel = new Map<string, number>()

  for (const asset of assets)
    downloadsByChannel.set(
      asset.channel,
      (downloadsByChannel.get(asset.channel) ?? 0) + asset.downloads
    )

  return [...downloadsByChannel.entries()]
    .map(([channel, downloads]) => ({ channel, downloads }))
    .sort(
      (left, right) => right.downloads - left.downloads ||
        left.channel.localeCompare(right.channel)
    )
}

export const buildReleaseAnalytics = (
  rows: readonly ReleaseAssetSnapshot[]
) => {
  const assets = getLatestReleaseAssets(rows)
    .sort(
      (left, right) => right.downloads - left.downloads ||
        left.assetName.localeCompare(right.assetName)
    )
    .map(row => ({
      assetName: row.assetName,
      channel: row.channel,
      downloads: row.downloads,
      releaseTag: row.releaseTag
    }))

  const history = buildReleaseHistory(rows)
  const first = history[0]
  const last = history[history.length - 1]

  return {
    assets,
    availableFrom: first?.collectedAt ?? null,
    availableTo: last?.collectedAt ?? null,
    channels: buildReleaseChannels(assets),
    downloadsGained: Math.max(
      0,
      (last?.downloads ?? 0) - (first?.downloads ?? 0)
    ),
    history,
    totalDownloads: assets.reduce(
      (total, asset) => total + asset.downloads,
      0
    )
  }
}

export const buildVscodeAnalytics = (
  rows: readonly VscodeExtensionSnapshot[]
) => {
  const sortedRows = rows
    .filter(row => row.provider === 'vscode-marketplace')
    .sort((left, right) => left.collectedAt - right.collectedAt)

  const latestByExtension = new Map<string, VscodeExtensionSnapshot>()

  const totalsByCollection = new Map<
    number,
    { downloads: number, installs: number }
  >()

  for (const row of sortedRows) {
    latestByExtension.set(row.extensionId, row)

    const totals = totalsByCollection.get(row.collectedAt) ?? {
      downloads: 0,
      installs: 0
    }

    totals.downloads += row.downloads

    totals.installs += row.installs

    totalsByCollection.set(row.collectedAt, totals)
  }

  const extensions = [...latestByExtension.values()]
    .sort(
      (left, right) => right.downloads - left.downloads ||
        left.extensionId.localeCompare(right.extensionId)
    )
    .map(row => ({
      downloads: row.downloads,
      extensionId: row.extensionId,
      installs: row.installs,
      lastUpdated: row.lastUpdated,
      rating: row.rating,
      slug: row.slug,
      updateCount: row.updateCount,
      version: row.version
    }))

  const history = [...totalsByCollection.entries()].map(
    ([collectedAt, totals]) => ({
      collectedAt: new Date(collectedAt).toISOString(),
      ...totals
    })
  )

  return {
    availableFrom: history[0]?.collectedAt ?? null,
    availableTo: history[history.length - 1]?.collectedAt ?? null,
    extensions,
    history,
    totalDownloads: extensions.reduce(
      (total, extension) => total + extension.downloads,
      0
    ),
    totalInstalls: extensions.reduce(
      (total, extension) => total + extension.installs,
      0
    )
  }
}

export const buildOpenVsxAnalytics = (
  rows: readonly VscodeExtensionSnapshot[]
) => {
  const sortedRows = rows
    .filter(row => row.provider === 'open-vsx')
    .sort((left, right) => left.collectedAt - right.collectedAt)

  const latestByExtension = new Map<string, VscodeExtensionSnapshot>()
  const downloadsByCollection = new Map<number, number>()

  for (const row of sortedRows) {
    latestByExtension.set(row.extensionId, row)

    downloadsByCollection.set(
      row.collectedAt,
      (downloadsByCollection.get(row.collectedAt) ?? 0) + row.downloads
    )
  }

  const extensions = [...latestByExtension.values()]
    .sort(
      (left, right) => right.downloads - left.downloads ||
        left.extensionId.localeCompare(right.extensionId)
    )
    .map(row => ({
      downloads: row.downloads,
      extensionId: row.extensionId,
      lastUpdated: row.lastUpdated,
      rating: row.rating,
      reviewCount: row.reviewCount,
      slug: row.slug,
      version: row.version
    }))

  const history = [...downloadsByCollection.entries()].map(
    ([collectedAt, downloads]) => ({
      collectedAt: new Date(collectedAt).toISOString(),
      downloads
    })
  )

  return {
    availableFrom: history[0]?.collectedAt ?? null,
    availableTo: history[history.length - 1]?.collectedAt ?? null,
    extensions,
    history,
    totalDownloads: extensions.reduce(
      (total, extension) => total + extension.downloads,
      0
    )
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

  const isEnabled = (slug: string) => getCanonicalProjectSlug(slug) === slug &&
    preferencesBySlug.get(slug)?.enabled !== false

  const now = Date.now()
  const since = now - getRangeMilliseconds(range)

  const [
    latestRows,
    historyRows,
    npmDownloadRows,
    releaseAssetRows,
    vscodeExtensionRows
  ] =
    await Promise.all([
      latestSuccessfulSync ?
        getSnapshotsForSyncRun(database, latestSuccessfulSync.id) :
        Promise.resolve([]),
      getPublicSnapshotsSince(database, since),
      getNpmDownloadsSince(database, getNpmRangeStart(range, now)),
      getReleaseAssetSnapshotsSince(database, since),
      getVscodeExtensionSnapshotsSince(database, since)
    ])

  return {
    historyRows: historyRows.filter(row => isEnabled(row.slug)),
    getPreference,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    npmDownloadRows: npmDownloadRows.filter(row => isEnabled(row.slug)),
    releaseAssetRows: releaseAssetRows.filter(row => isEnabled(row.slug)),
    sync,
    vscodeExtensionRows: vscodeExtensionRows.filter(row => isEnabled(row.slug))
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
    releaseAssetRows,
    sync,
    vscodeExtensionRows
  } = await getDashboardRows(env, range)

  const projects = latestRows
    .filter(row => isEnabled(row.slug))
    .map(row => toProjectMetric(row, getPreference(row.slug)))
    .sort(compareProjectRelevance)

  const history = buildHistory(historyRows, range)

  return dashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    growth: getProjectGrowth(historyRows, projects),
    history,
    npmAnalytics: buildNpmAnalytics(npmDownloadRows),
    openVsxAnalytics: buildOpenVsxAnalytics(vscodeExtensionRows),
    operationalHealth: buildPortfolioOperationalHealth(historyRows, projects),
    period: getPeriodSummary(historyRows),
    projects,
    range,
    releaseAnalytics: buildReleaseAnalytics(releaseAssetRows),
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
        (total, project) => total + project.npmDownloads30d,
        0
      ),
      openIssues: projects.reduce(
        (total, project) => total + project.openIssues,
        0
      ),
      publicProjects: projects.length
    },
    sync: toSyncState(sync, latestSuccessfulSync),
    vscodeAnalytics: buildVscodeAnalytics(vscodeExtensionRows)
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
    npmDownloadRows,
    releaseAssetRows,
    sync,
    vscodeExtensionRows
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

  const projectNpmDownloadRows = npmDownloadRows.filter(
    snapshot => snapshot.slug === slug
  )

  const projectReleaseAssetRows = releaseAssetRows.filter(
    snapshot => snapshot.slug === slug
  )

  const project = toProjectMetric(row, preference)
  const growth = getProjectGrowth(projectHistoryRows, [project])[0]

  if (!growth) return null

  return projectDashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    growth,
    history,
    npmAnalytics: buildNpmAnalytics(projectNpmDownloadRows),
    openVsxAnalytics: buildOpenVsxAnalytics(
      vscodeExtensionRows.filter(snapshot => snapshot.slug === slug)
    ),
    operationalHealth: buildOperationalHealth(projectHistoryRows, slug),
    period: getPeriodSummary(projectHistoryRows),
    project,
    range,
    releaseAnalytics: buildReleaseAnalytics(projectReleaseAssetRows),
    sync: toSyncState(sync, latestSuccessfulSync),
    vscodeAnalytics: buildVscodeAnalytics(
      vscodeExtensionRows.filter(snapshot => snapshot.slug === slug)
    ),
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
      websiteAnalyticsEnabled: preference?.websiteAnalyticsEnabled ?? true
    }
  })

  return projectSettingsSchema.parse({
    projects: projects.sort(compareProjectRelevance),
    sync: toSyncState(sync, latestSuccessfulSync)
  })
}
