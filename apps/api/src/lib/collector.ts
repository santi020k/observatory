import {
  getCanonicalProjectSlug,
  getCatalogOverride,
  getVscodeExtensionMappings,
  githubOwner,
  type ProjectCategory,
  type ProjectStatus,
  titleFromSlug
} from '@santi020k/observatory-catalog'
import {
  completeSyncRun,
  createDb,
  getLatestNpmDownloadDates,
  getNpmDownloadsSince,
  getWebsiteAnalyticsSince,
  insertSnapshots,
  insertVscodeExtensionSnapshots,
  type NpmDownloadWrite,
  type SnapshotWrite,
  startSyncRun,
  upsertNpmDownloads,
  type VscodeExtensionWrite
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

interface GithubRepository {
  archived: boolean
  description: string | null
  fork: boolean
  forks_count: number
  homepage: string | null
  html_url: string
  name: string
  open_issues_count: number
  private: boolean
  pushed_at: string | null
  stargazers_count: number
  topics: string[]
}

interface GithubTraffic {
  count: number
}

interface PackageMetrics {
  downloadHistory: readonly PackageDownload[]
  downloads: number
  latestVersion: string | null
  packages: readonly PackageMetric[]
}

interface PackageMetric {
  downloadHistory: readonly PackageDownload[]
  downloads: number
  latestVersion: string | null
  packageName: string
}

interface PackageDownload {
  day: string
  downloads: number
  packageName: string
}

interface AuthorPackage {
  name: string
  repository: string | null
  version: string
}

interface VscodeGalleryExtension {
  extensionName: string
  publisher: { publisherName: string }
  statistics: { statisticName: string, value: number }[]
  versions: { lastUpdated: string, version: string }[]
}

interface OpenVsxExtension {
  averageRating: number | null
  downloadCount: number
  name: string
  namespace: string
  reviewCount: number
  timestamp: string
  version: string
}

interface WebsiteHealth {
  responseTimeMs: number | null
  status: 'degraded' | 'healthy' | 'unknown'
}

const dayMilliseconds = 24 * 60 * 60 * 1_000
const relevanceWindowMilliseconds = 30 * dayMilliseconds
const npmRequestConcurrency = 1
const npmRequestDelayMilliseconds = 250
const npmRetryAttempts = 3

const relevanceWeights = {
  forks: 0.03,
  githubClones: 0.07,
  githubViews: 0.1,
  npmDownloads: 0.5,
  recency: 0.04,
  stars: 0.06,
  websitePageViews: 0.2
} as const

const normalizeSignal = (
  value: number,
  maximum: number
): number => maximum > 0 ? Math.log1p(value) / Math.log1p(maximum) : 0

const getRecencySignal = (pushedAt: string | null, now: number): number => {
  if (!pushedAt) return 0

  const pushedAtTime = Date.parse(pushedAt)

  if (!Number.isFinite(pushedAtTime)) return 0

  const ageInDays = Math.max(0, now - pushedAtTime) / dayMilliseconds

  return Math.max(0, 1 - ageInDays / 365)
}

const scoreSnapshotsByRelevance = (
  snapshots: readonly SnapshotWrite[],
  websitePageViewsBySlug: ReadonlyMap<string, number>,
  now: number
): SnapshotWrite[] => {
  const maximum = (select: (snapshot: SnapshotWrite) => number): number => Math.max(0, ...snapshots.map(select))

  const maxima = {
    forks: maximum(snapshot => snapshot.forks),
    githubClones: maximum(snapshot => snapshot.githubClones14d ?? 0),
    githubViews: maximum(snapshot => snapshot.githubViews14d ?? 0),
    npmDownloads: maximum(snapshot => snapshot.npmDownloads30d),
    stars: maximum(snapshot => snapshot.stars),
    websitePageViews: maximum(
      snapshot => websitePageViewsBySlug.get(snapshot.slug) ?? 0
    )
  }

  return snapshots.map(snapshot => {
    const websitePageViews = websitePageViewsBySlug.get(snapshot.slug) ?? 0

    const score =
      normalizeSignal(snapshot.npmDownloads30d, maxima.npmDownloads) *
      relevanceWeights.npmDownloads +
      normalizeSignal(websitePageViews, maxima.websitePageViews) *
      relevanceWeights.websitePageViews +
      normalizeSignal(snapshot.githubViews14d ?? 0, maxima.githubViews) *
      relevanceWeights.githubViews +
      normalizeSignal(snapshot.githubClones14d ?? 0, maxima.githubClones) *
      relevanceWeights.githubClones +
      normalizeSignal(snapshot.stars, maxima.stars) * relevanceWeights.stars +
      normalizeSignal(snapshot.forks, maxima.forks) * relevanceWeights.forks +
      getRecencySignal(snapshot.pushedAt, now) * relevanceWeights.recency

    return {
      ...snapshot,
      relevanceScore: Math.round(score * 100)
    }
  })
}

class ProviderRequestError extends Error {
  constructor(
    readonly status: number,
    readonly url: string
  ) {
    super(`Provider request failed with ${status}: ${url}`)

    this.name = 'ProviderRequestError'
  }
}

const githubHeaders = (token?: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'santi-observatory',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
})

const fetchJson = async <Result>(
  url: string,
  headers?: HeadersInit,
  init?: RequestInit
): Promise<Result> => {
  const response = await fetch(url, {
    ...init,
    ...(headers ? { headers } : {}),
    signal: AbortSignal.timeout(8_000)
  })

  if (!response.ok) {
    throw new ProviderRequestError(response.status, url)
  }

  return response.json<Result>()
}

const delay = (milliseconds: number): Promise<void> => new Promise(
  resolve => setTimeout(resolve, milliseconds)
)

const toIsoDate = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10)

const fetchNpmJson = async <Result>(url: string): Promise<Result> => {
  for (let attempt = 0; attempt < npmRetryAttempts; attempt += 1) {
    try {
      return await fetchJson<Result>(url)
    } catch (error) {
      const canRetry =
        error instanceof ProviderRequestError &&
        error.status === 429 &&
        attempt < npmRetryAttempts - 1

      if (!canRetry) throw error

      await delay(1_000 * 2 ** attempt)
    }
  }

  throw new Error('npm request retry limit reached')
}

interface NpmDownloadsResponse {
  downloads: { day: string, downloads: number }[]
}

const collectNpmDownloads = async (
  url: string,
  packageName: string,
  cachedDownloads: ReadonlyMap<string, PackageDownload[]>
): Promise<NpmDownloadsResponse | null> => {
  try {
    return await fetchNpmJson<NpmDownloadsResponse>(url)
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404)
      return { downloads: [] }

    const cachedPackageDownloads = cachedDownloads.get(packageName)

    if (
      error instanceof ProviderRequestError &&
      error.status === 429 &&
      cachedPackageDownloads &&
      cachedPackageDownloads.length > 0
    ) {
      return { downloads: cachedPackageDownloads }
    }

    if (error instanceof ProviderRequestError && error.status === 429)
      return null

    throw error
  }
}

const groupCachedDownloads = (
  rows: readonly NpmDownloadWrite[]
): ReadonlyMap<string, PackageDownload[]> => {
  const downloadsByPackage = new Map<string, PackageDownload[]>()

  for (const row of rows) {
    const packageDownloads = downloadsByPackage.get(row.packageName) ?? []

    packageDownloads.push({
      day: toIsoDate(row.periodStart),
      downloads: row.downloads,
      packageName: row.packageName
    })

    downloadsByPackage.set(row.packageName, packageDownloads)
  }

  return downloadsByPackage
}

const collectVscodeExtensions = async (
  collectedAt: number,
  syncRunId: string
): Promise<VscodeExtensionWrite[]> => Promise.all(
  getVscodeExtensionMappings().map(async ({ extensionId, slug }) => {
    const result = await fetchJson<{
      results: { extensions: VscodeGalleryExtension[] }[]
    }>(
      'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
        Accept: 'application/json;api-version=7.2-preview.1',
        'Content-Type': 'application/json',
        'User-Agent': 'santi-observatory'
      }, {
        body: JSON.stringify({
          assetTypes: [],
          filters: [
            {
              criteria: [{ filterType: 7, value: extensionId }],
              pageNumber: 1,
              pageSize: 1,
              sortBy: 0,
              sortOrder: 0
            }
          ],
          flags: 870
        }),
        method: 'POST'
      }
    )

    const extension = result.results[0]?.extensions[0]
    const latestVersion = extension?.versions[0]

    if (!extension || !latestVersion)
      throw new Error(`VS Code extension was not found: ${extensionId}`)

    const statistics = new Map(
      extension.statistics.map(statistic => [
        statistic.statisticName,
        statistic.value
      ])
    )

    return {
      collectedAt,
      downloads: Math.round(statistics.get('downloadCount') ?? 0),
      extensionId,
      id: crypto.randomUUID(),
      installs: Math.round(statistics.get('install') ?? 0),
      lastUpdated: latestVersion.lastUpdated,
      provider: 'vscode-marketplace',
      rating: statistics.get('weightedRating') ?? null,
      reviewCount: 0,
      slug,
      syncRunId,
      updateCount: Math.round(statistics.get('updateCount') ?? 0),
      version: latestVersion.version
    }
  })
)

const collectOpenVsxExtensions = async (
  collectedAt: number,
  syncRunId: string
): Promise<VscodeExtensionWrite[]> => Promise.all(
  getVscodeExtensionMappings().map(async ({ extensionId, slug }) => {
    const [namespace = '', name = ''] = extensionId.split('.', 2)

    const extension = await fetchJson<OpenVsxExtension>(
      `https://open-vsx.org/api/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
    )

    return {
      collectedAt,
      downloads: extension.downloadCount,
      extensionId,
      id: crypto.randomUUID(),
      installs: 0,
      lastUpdated: extension.timestamp,
      provider: 'open-vsx',
      rating: extension.averageRating,
      reviewCount: extension.reviewCount,
      slug,
      syncRunId,
      updateCount: 0,
      version: extension.version
    }
  })
)

const collectGithubRepositories = async (
  token?: string
): Promise<GithubRepository[]> => {
  const repositories: GithubRepository[] = []
  let page = 1
  let pageRepositories: GithubRepository[]

  do {
    pageRepositories = await fetchJson<GithubRepository[]>(
      `https://api.github.com/users/${githubOwner}/repos?per_page=100&sort=updated&page=${page}`, githubHeaders(token)
    )

    repositories.push(...pageRepositories)

    page += 1
  } while (pageRepositories.length === 100)

  return repositories.filter(repository => !repository.fork &&
    getCanonicalProjectSlug(repository.name) === repository.name)
}

const collectTraffic = async (
  repository: string,
  metric: 'clones' | 'views',
  token?: string
): Promise<number | null> => {
  if (!token) return null

  try {
    const traffic = await fetchJson<GithubTraffic>(
      `https://api.github.com/repos/${githubOwner}/${repository}/traffic/${metric}`, githubHeaders(token)
    )

    return traffic.count
  } catch {
    // Traffic requires additional GitHub permissions. Keep it unavailable
    // without invalidating otherwise healthy public metadata snapshots.
    return null
  }
}

const collectOpenPullRequestsCount = async (
  repository: string,
  token?: string
): Promise<number> => {
  try {
    const pulls = await fetchJson<unknown[]>(
      `https://api.github.com/repos/${githubOwner}/${repository}/pulls?state=open&per_page=100`, githubHeaders(token)
    )

    return pulls.length
  } catch {
    return 0
  }
}

const collectAuthorPackages = async (): Promise<AuthorPackage[]> => {
  const result = await fetchJson<{
    objects: {
      package: {
        links?: { repository?: string }
        name: string
        version: string
      }
    }[]
  }>(
    `https://registry.npmjs.org/-/v1/search?text=maintainer%3A${githubOwner}&size=250`
  )

  return result.objects.map(({ package: packageResult }) => ({
    name: packageResult.name,
    repository: packageResult.links?.repository ?? null,
    version: packageResult.version
  }))
}

const collectPackageMetrics = async (
  packageNames: readonly string[],
  latestDownloadDates: ReadonlyMap<string, number> = new Map(),
  now: number = Date.now(),
  latestVersions: ReadonlyMap<string, string> = new Map(),
  cachedDownloads: readonly NpmDownloadWrite[] = []
): Promise<PackageMetrics> => {
  const today = new Date(now)

  const completedDayEnd = Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1
  )

  const rollingStart = completedDayEnd - 29 * dayMilliseconds
  const bootstrapStart = completedDayEnd - 364 * dayMilliseconds
  const metrics: PackageMetric[] = []
  const cachedDownloadsByPackage = groupCachedDownloads(cachedDownloads)

  for (
    let index = 0;
    index < packageNames.length;
    index += npmRequestConcurrency
  ) {
    const packageBatch = packageNames.slice(
      index, index + npmRequestConcurrency
    )

    const batchMetrics = await Promise.all(
      packageBatch.map(async (
        packageName
      ): Promise<PackageMetric | null> => {
        const encoded = encodeURIComponent(packageName)
        const latestDownloadDate = latestDownloadDates.get(packageName)

        const rangeStart =
          latestDownloadDate === undefined ? bootstrapStart : rollingStart

        const period = `${toIsoDate(rangeStart)}:${toIsoDate(completedDayEnd)}`

        const downloadsUrl =
          `https://api.npmjs.org/downloads/range/${period}/${encoded}`

        const downloads = await collectNpmDownloads(
          downloadsUrl, packageName, cachedDownloadsByPackage
        )

        if (!downloads) return null

        const knownVersion = latestVersions.get(packageName)

        const registry =
          knownVersion === undefined ?
            await fetchJson<{ 'dist-tags'?: { latest?: string } }>(
              `https://registry.npmjs.org/${encoded}`
            ) :
            null

        return {
          downloadHistory: downloads.downloads.map(point => ({
            ...point,
            packageName
          })),
          downloads: downloads.downloads.reduce((total, point) => {
            const timestamp = Date.parse(`${point.day}T00:00:00.000Z`)

            return timestamp >= rollingStart ? total + point.downloads : total
          }, 0),
          latestVersion:
            knownVersion ?? registry?.['dist-tags']?.latest ?? null,
          packageName
        }
      })
    )

    metrics.push(...batchMetrics.filter(
      (metric): metric is PackageMetric => metric !== null
    ))

    if (index + npmRequestConcurrency < packageNames.length)
      await delay(npmRequestDelayMilliseconds)
  }

  return {
    downloadHistory: metrics.flatMap(metric => metric.downloadHistory),
    downloads: metrics.reduce((total, metric) => total + metric.downloads, 0),
    latestVersion:
      metrics.find(metric => metric.latestVersion)?.latestVersion ?? null,
    packages: metrics
  }
}

const mergePackageMetrics = (
  packageNames: readonly string[],
  metricsByPackage: ReadonlyMap<string, PackageMetric>
): PackageMetrics => {
  const metrics = packageNames.flatMap(packageName => {
    const metric = metricsByPackage.get(packageName)

    return metric ? [metric] : []
  })

  const downloads = metrics.reduce(
    (total, metric) => total + metric.downloads, 0
  )

  return {
    downloadHistory: metrics.flatMap(metric => metric.downloadHistory),
    downloads: metrics.length === 0 ?
      0 :
      Math.round(downloads / metrics.length),
    latestVersion:
      metrics.find(metric => metric.latestVersion)?.latestVersion ?? null,
    packages: metrics
  }
}

const getPackageProjectSlug = (packageResult: AuthorPackage): string => {
  if (packageResult.repository) {
    try {
      const repositoryUrl = new URL(
        packageResult.repository.replace(/^git\+/, '')
      )

      const [owner, repository] = repositoryUrl.pathname
        .replace(/\.git$/, '')
        .split('/')
        .filter(Boolean)

      if (owner === githubOwner && repository)
        return getCanonicalProjectSlug(repository)
    } catch {
      // Fall through to the stable package-name fallback.
    }
  }

  const packageNameParts = packageResult.name.split('/')

  return packageNameParts[packageNameParts.length - 1] ?? packageResult.name
}

const checkWebsite = async (website: string | null): Promise<WebsiteHealth> => {
  if (!website) return { responseTimeMs: null, status: 'unknown' }

  const startedAt = Date.now()

  try {
    let response = await fetch(website, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000)
    })

    if (response.status === 405 || response.status === 501) {
      response = await fetch(website, {
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(6_000)
      })
    }

    return {
      responseTimeMs: Date.now() - startedAt,
      status: response.ok ? 'healthy' : 'degraded'
    }
  } catch {
    return { responseTimeMs: null, status: 'degraded' }
  }
}

const inferCategory = (repository: GithubRepository): ProjectCategory => {
  if (repository.homepage) return 'app'

  if (repository.topics.includes('cli')) return 'tool'

  return 'library'
}

const inferStatus = (repository: GithubRepository): ProjectStatus => {
  if (repository.archived) return 'archived'

  const lastPush = repository.pushed_at ? Date.parse(repository.pushed_at) : 0
  const ageInDays = (Date.now() - lastPush) / (24 * 60 * 60 * 1000)

  if (ageInDays > 365) return 'paused'

  if (ageInDays > 90) return 'maintained'

  return 'active'
}

interface CollectedRepositoryData {
  clones: number | null
  packageMetrics: PackageMetrics
  pullRequestsCount: number
  views: number | null
  websiteHealth: WebsiteHealth
}

const getSnapshotCategory = (
  repository: GithubRepository
): ProjectCategory => getCatalogOverride(repository.name)?.category ??
  inferCategory(repository)

const getSnapshotName = (
  repository: GithubRepository
): string => getCatalogOverride(repository.name)?.displayName ??
  titleFromSlug(repository.name)

const getSnapshotPackages = (
  repository: GithubRepository
): readonly string[] => getCatalogOverride(repository.name)?.npmPackages ?? []

const getSnapshotStatus = (
  repository: GithubRepository
): ProjectStatus => getCatalogOverride(repository.name)?.status ??
  inferStatus(repository)

const toSnapshot = (
  repository: GithubRepository,
  collectedAt: number,
  syncRunId: string,
  collected: CollectedRepositoryData
): SnapshotWrite => {
  const { clones, packageMetrics, pullRequestsCount, views, websiteHealth } =
    collected

  return {
    archived: repository.archived,
    category: getSnapshotCategory(repository),
    collectedAt,
    description: repository.description,
    forks: repository.forks_count,
    githubClones14d: clones,
    githubViews14d: views,
    healthStatus: websiteHealth.status,
    id: crypto.randomUUID(),
    latestVersion: packageMetrics.latestVersion,
    name: getSnapshotName(repository),
    npmDownloads30d: packageMetrics.downloads,
    npmPackages: packageMetrics.packages.map(metric => metric.packageName),
    openIssues: Math.max(0, repository.open_issues_count - pullRequestsCount),
    pushedAt: repository.pushed_at,
    relevanceScore: 0,
    repositoryUrl: repository.html_url,
    responseTimeMs: websiteHealth.responseTimeMs,
    slug: repository.name,
    stars: repository.stargazers_count,
    status: getSnapshotStatus(repository),
    syncRunId,
    topics: repository.topics,
    visibility: repository.private ? 'private' : 'public',
    websiteUrl: repository.homepage || null
  }
}

const collectRepository = async (
  repository: GithubRepository,
  env: Bindings,
  collectedAt: number,
  syncRunId: string,
  metricsByPackage: ReadonlyMap<string, PackageMetric>,
  packages: readonly string[]
): Promise<SnapshotWrite> => {
  const [packageMetrics, websiteHealth, views, clones, pullRequestsCount] =
    await Promise.all([
      Promise.resolve(mergePackageMetrics(packages, metricsByPackage)),
      checkWebsite(repository.homepage),
      collectTraffic(repository.name, 'views', env.GITHUB_TOKEN),
      collectTraffic(repository.name, 'clones', env.GITHUB_TOKEN),
      collectOpenPullRequestsCount(repository.name, env.GITHUB_TOKEN)
    ])

  return toSnapshot(repository, collectedAt, syncRunId, {
    clones,
    packageMetrics,
    pullRequestsCount,
    views,
    websiteHealth
  })
}

export const syncProjects = async (env: Bindings): Promise<number> => {
  const database = createDb(env.DB)
  const runId = crypto.randomUUID()
  const startedAt = Date.now()

  await startSyncRun(database, runId, startedAt)

  try {
    const [
      repositories,
      websiteAnalytics,
      latestNpmDownloadDates,
      cachedNpmDownloads,
      authorPackages,
      vscodeExtensions,
      openVsxExtensions
    ] = await Promise.all([
      collectGithubRepositories(env.GITHUB_TOKEN),
      getWebsiteAnalyticsSince(
        database, startedAt - relevanceWindowMilliseconds
      ),
      getLatestNpmDownloadDates(database),
      getNpmDownloadsSince(
        database, startedAt - relevanceWindowMilliseconds
      ),
      collectAuthorPackages(),
      collectVscodeExtensions(startedAt, runId),
      collectOpenVsxExtensions(startedAt, runId)
    ])

    const websitePageViewsBySlug = new Map<string, number>()

    for (const row of websiteAnalytics) {
      websitePageViewsBySlug.set(
        row.slug, (websitePageViewsBySlug.get(row.slug) ?? 0) + row.pageViews
      )
    }

    const latestDownloadDates = new Map(
      latestNpmDownloadDates.flatMap(row => row.periodStart === null ?
        [] :
        [[row.packageName, row.periodStart] as const])
    )

    const packageMetrics = await collectPackageMetrics(
      authorPackages.map(packageResult => packageResult.name), latestDownloadDates, startedAt, new Map(
        authorPackages.map(packageResult => [
          packageResult.name,
          packageResult.version
        ])
      ), cachedNpmDownloads
    )

    const metricsByPackage = new Map(
      packageMetrics.packages.map(metric => [metric.packageName, metric])
    )

    const slugByPackage = new Map(
      authorPackages.map(packageResult => [
        packageResult.name,
        getPackageProjectSlug(packageResult)
      ])
    )

    const discoveredPackagesBySlug = new Map<string, string[]>()

    for (const [packageName, slug] of slugByPackage) {
      const packages = discoveredPackagesBySlug.get(slug) ?? []

      packages.push(packageName)

      discoveredPackagesBySlug.set(slug, packages)
    }

    const collectedSnapshots = await Promise.all(
      repositories.map(repository => {
        const packages = [...new Set([
          ...getSnapshotPackages(repository),
          ...(discoveredPackagesBySlug.get(repository.name) ?? [])
        ])]

        return collectRepository(
          repository, env, startedAt, runId, metricsByPackage, packages
        )
      })
    )

    const snapshots = scoreSnapshotsByRelevance(
      collectedSnapshots, websitePageViewsBySlug, startedAt
    )

    const npmDownloads: NpmDownloadWrite[] =
      packageMetrics.downloadHistory.flatMap(point => {
        const periodStart = Date.parse(`${point.day}T00:00:00.000Z`)
        const latestPeriod = latestDownloadDates.get(point.packageName)

        if (
          latestPeriod !== undefined &&
          periodStart < latestPeriod - 2 * dayMilliseconds
        ) {
          return []
        }

        return [
          {
            collectedAt: startedAt,
            downloads: point.downloads,
            id: crypto.randomUUID(),
            packageName: point.packageName,
            periodStart,
            slug:
              slugByPackage.get(point.packageName) ??
              getPackageProjectSlug({
                name: point.packageName,
                repository: null,
                version: ''
              })
          }
        ]
      })

    await insertSnapshots(database, snapshots)

    await upsertNpmDownloads(database, npmDownloads)

    await insertVscodeExtensionSnapshots(
      database, [...vscodeExtensions, ...openVsxExtensions]
    )

    await completeSyncRun(database, runId, {
      completedAt: Date.now(),
      projectCount: snapshots.length,
      status: 'succeeded'
    })

    return snapshots.length
  } catch (error) {
    await completeSyncRun(database, runId, {
      completedAt: Date.now(),
      errorMessage:
        error instanceof Error ? error.message : 'Unknown sync error',
      projectCount: 0,
      status: 'failed'
    })

    throw error
  }
}

export const collectorInternals = {
  checkWebsite,
  collectAuthorPackages,
  collectGithubRepositories,
  collectOpenVsxExtensions,
  collectPackageMetrics,
  collectVscodeExtensions,
  mergePackageMetrics,
  scoreSnapshotsByRelevance
}
