import {
  getCatalogOverride,
  githubOwner,
  type ProjectCategory,
  type ProjectStatus,
  titleFromSlug,
} from '@santi020k/observatory-catalog'
import {
  completeSyncRun,
  createDb,
  getWebsiteAnalyticsSince,
  insertSnapshots,
  type SnapshotWrite,
  startSyncRun,
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
  downloads: number
  latestVersion: string | null
}

const dayMilliseconds = 24 * 60 * 60 * 1_000
const relevanceWindowMilliseconds = 30 * dayMilliseconds

const relevanceWeights = {
  forks: 0.03,
  githubClones: 0.07,
  githubViews: 0.1,
  npmDownloads: 0.5,
  recency: 0.04,
  stars: 0.06,
  websitePageViews: 0.2,
} as const

const normalizeSignal = (value: number, maximum: number): number =>
  maximum > 0 ? Math.log1p(value) / Math.log1p(maximum) : 0

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
  now: number,
): SnapshotWrite[] => {
  const maximum = (select: (snapshot: SnapshotWrite) => number): number =>
    Math.max(0, ...snapshots.map(select))

  const maxima = {
    forks: maximum((snapshot) => snapshot.forks),
    githubClones: maximum((snapshot) => snapshot.githubClones14d ?? 0),
    githubViews: maximum((snapshot) => snapshot.githubViews14d ?? 0),
    npmDownloads: maximum((snapshot) => snapshot.npmDownloads30d),
    stars: maximum((snapshot) => snapshot.stars),
    websitePageViews: maximum(
      (snapshot) => websitePageViewsBySlug.get(snapshot.slug) ?? 0,
    ),
  }

  return snapshots.map((snapshot) => {
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
      relevanceScore: Math.round(score * 100),
    }
  })
}

class ProviderRequestError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`Provider request failed with ${status}: ${url}`)

    this.name = 'ProviderRequestError'
  }
}

const githubHeaders = (token?: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'santi-observatory',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const fetchJson = async <Result>(
  url: string,
  headers?: HeadersInit,
): Promise<Result> => {
  const response = await fetch(url, {
    ...(headers ? { headers } : {}),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) {
    throw new ProviderRequestError(response.status, url)
  }

  return response.json<Result>()
}

const collectGithubRepositories = async (
  token?: string,
): Promise<GithubRepository[]> => {
  const repositories: GithubRepository[] = []
  let page = 1
  let pageRepositories: GithubRepository[]

  do {
    pageRepositories = await fetchJson<GithubRepository[]>(
      `https://api.github.com/users/${githubOwner}/repos?per_page=100&sort=updated&page=${page}`,
      githubHeaders(token),
    )

    repositories.push(...pageRepositories)

    page += 1
  } while (pageRepositories.length === 100)

  return repositories.filter((repository) => !repository.fork)
}

const collectTraffic = async (
  repository: string,
  metric: 'clones' | 'views',
  token?: string,
): Promise<number | null> => {
  if (!token) return null

  try {
    const traffic = await fetchJson<GithubTraffic>(
      `https://api.github.com/repos/${githubOwner}/${repository}/traffic/${metric}`,
      githubHeaders(token),
    )

    return traffic.count
  } catch {
    // Traffic requires additional GitHub permissions. Keep it unavailable
    // without invalidating otherwise healthy public metadata snapshots.
    return null
  }
}

const collectPackageMetrics = async (
  packageNames: readonly string[],
): Promise<PackageMetrics> => {
  const metrics = await Promise.all(
    packageNames.map(async (packageName) => {
      const encoded = encodeURIComponent(packageName)

      const [downloads, registry] = await Promise.all([
        fetchJson<{ downloads: number }>(
          `https://api.npmjs.org/downloads/point/last-month/${encoded}`,
        ).catch((error: unknown) => {
          if (error instanceof ProviderRequestError && error.status === 404) {
            return { downloads: 0 }
          }

          throw error
        }),
        fetchJson<{ 'dist-tags'?: { latest?: string } }>(
          `https://registry.npmjs.org/${encoded}`,
        ),
      ])

      return {
        downloads: downloads.downloads,
        latestVersion: registry['dist-tags']?.latest ?? null,
      }
    }),
  )

  return {
    downloads: metrics.reduce((total, metric) => total + metric.downloads, 0),
    latestVersion:
      metrics.find((metric) => metric.latestVersion)?.latestVersion ?? null,
  }
}

const checkWebsite = async (
  website: string | null,
): Promise<{
  responseTimeMs: number | null
  status: 'degraded' | 'healthy' | 'unknown'
}> => {
  if (!website) return { responseTimeMs: null, status: 'unknown' }

  const startedAt = Date.now()

  try {
    let response = await fetch(website, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000),
    })

    if (response.status === 405 || response.status === 501) {
      response = await fetch(website, {
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(6_000),
      })
    }

    return {
      responseTimeMs: Date.now() - startedAt,
      status: response.ok ? 'healthy' : 'degraded',
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

const collectRepository = async (
  repository: GithubRepository,
  env: Bindings,
  collectedAt: number,
  syncRunId: string,
): Promise<SnapshotWrite> => {
  const override = getCatalogOverride(repository.name)
  const packages = override?.npmPackages ?? []

  const [packageMetrics, websiteHealth, views, clones] = await Promise.all([
    collectPackageMetrics(packages),
    checkWebsite(repository.homepage),
    collectTraffic(repository.name, 'views', env.GITHUB_TOKEN),
    collectTraffic(repository.name, 'clones', env.GITHUB_TOKEN),
  ])

  return {
    archived: repository.archived,
    category: override?.category ?? inferCategory(repository),
    collectedAt,
    description: repository.description,
    forks: repository.forks_count,
    githubClones14d: clones,
    githubViews14d: views,
    healthStatus: websiteHealth.status,
    id: crypto.randomUUID(),
    latestVersion: packageMetrics.latestVersion,
    name: override?.displayName ?? titleFromSlug(repository.name),
    npmDownloads30d: packageMetrics.downloads,
    npmPackages: packages,
    openIssues: repository.open_issues_count,
    pushedAt: repository.pushed_at,
    relevanceScore: 0,
    repositoryUrl: repository.html_url,
    responseTimeMs: websiteHealth.responseTimeMs,
    slug: repository.name,
    stars: repository.stargazers_count,
    status: override?.status ?? inferStatus(repository),
    syncRunId,
    topics: repository.topics,
    visibility: repository.private ? 'private' : 'public',
    websiteUrl: repository.homepage || null,
  }
}

export const syncProjects = async (env: Bindings): Promise<number> => {
  const database = createDb(env.DB)
  const runId = crypto.randomUUID()
  const startedAt = Date.now()

  await startSyncRun(database, runId, startedAt)

  try {
    const [repositories, websiteAnalytics] = await Promise.all([
      collectGithubRepositories(env.GITHUB_TOKEN),
      getWebsiteAnalyticsSince(
        database,
        startedAt - relevanceWindowMilliseconds,
      ),
    ])

    const websitePageViewsBySlug = new Map<string, number>()

    for (const row of websiteAnalytics) {
      websitePageViewsBySlug.set(
        row.slug,
        (websitePageViewsBySlug.get(row.slug) ?? 0) + row.pageViews,
      )
    }

    const collectedSnapshots = await Promise.all(
      repositories.map((repository) =>
        collectRepository(repository, env, startedAt, runId),
      ),
    )

    const snapshots = scoreSnapshotsByRelevance(
      collectedSnapshots,
      websitePageViewsBySlug,
      startedAt,
    )

    await insertSnapshots(database, snapshots)

    await completeSyncRun(database, runId, {
      completedAt: Date.now(),
      projectCount: snapshots.length,
      status: 'succeeded',
    })

    return snapshots.length
  } catch (error) {
    await completeSyncRun(database, runId, {
      completedAt: Date.now(),
      errorMessage:
        error instanceof Error ? error.message : 'Unknown sync error',
      projectCount: 0,
      status: 'failed',
    })

    throw error
  }
}

export const collectorInternals = {
  checkWebsite,
  collectGithubRepositories,
  collectPackageMetrics,
  scoreSnapshotsByRelevance,
}
