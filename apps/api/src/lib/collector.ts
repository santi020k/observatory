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

const githubHeaders = (token?: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'santi-observatory',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const fetchJson = async <Result>(
  url: string,
  headers?: HeadersInit,
): Promise<Result | null> => {
  const response = await fetch(url, {
    ...(headers ? { headers } : {}),
    signal: AbortSignal.timeout(8_000),
  })

  if (!response.ok) return null

  return response.json<Result>()
}

const collectGithubRepositories = async (
  token?: string,
): Promise<GithubRepository[]> => {
  const repositories = await fetchJson<GithubRepository[]>(
    `https://api.github.com/users/${githubOwner}/repos?per_page=100&sort=updated`,
    githubHeaders(token),
  )

  return (repositories ?? []).filter((repository) => !repository.fork)
}

const collectTraffic = async (
  repository: string,
  metric: 'clones' | 'views',
  token?: string,
): Promise<number | null> => {
  if (!token) return null

  const traffic = await fetchJson<GithubTraffic>(
    `https://api.github.com/repos/${githubOwner}/${repository}/traffic/${metric}`,
    githubHeaders(token),
  )

  return traffic?.count ?? null
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
        ),
        fetchJson<{ 'dist-tags'?: { latest?: string } }>(
          `https://registry.npmjs.org/${encoded}`,
        ),
      ])

      return {
        downloads: downloads?.downloads ?? 0,
        latestVersion: registry?.['dist-tags']?.latest ?? null,
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
    const response = await fetch(website, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000),
    })

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
    repositoryUrl: repository.html_url,
    responseTimeMs: websiteHealth.responseTimeMs,
    slug: repository.name,
    stars: repository.stargazers_count,
    status: override?.status ?? inferStatus(repository),
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
    const repositories = await collectGithubRepositories(env.GITHUB_TOKEN)

    const snapshots = await Promise.all(
      repositories.map((repository) =>
        collectRepository(repository, env, startedAt),
      ),
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
