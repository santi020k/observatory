import {
  type Dashboard,
  dashboardSchema,
  type ProjectMetric,
} from '@santi020k/observatory-api-types'
import {
  createDb,
  getLatestSnapshots,
  getLatestSyncRun,
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

const parseStringArray = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value)

    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
      ? parsed
      : []
  } catch {
    return []
  }
}

const sumNullable = (values: readonly (number | null)[]): number | null => {
  const available = values.filter((value): value is number => value !== null)

  return available.length > 0
    ? available.reduce((total, value) => total + value, 0)
    : null
}

export const buildDashboard = async (env: Bindings): Promise<Dashboard> => {
  const database = createDb(env.DB)

  const [rows, sync] = await Promise.all([
    getLatestSnapshots(database),
    getLatestSyncRun(database),
  ])

  const projects: ProjectMetric[] = rows.map((row) => ({
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
    pushedAt: row.pushedAt,
    responseTimeMs: row.responseTimeMs,
    slug: row.slug,
    sources: {
      github: row.repositoryUrl,
      npm: parseStringArray(row.npmPackages),
      website: row.websiteUrl,
    },
    stars: row.stars,
    status: row.status as ProjectMetric['status'],
    topics: parseStringArray(row.topics),
    visibility: row.visibility as ProjectMetric['visibility'],
  }))

  return dashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    projects,
    summary: {
      activeProjects: projects.filter((project) => project.status === 'active')
        .length,
      githubClones14d: sumNullable(
        projects.map((project) => project.githubClones14d),
      ),
      githubViews14d: sumNullable(
        projects.map((project) => project.githubViews14d),
      ),
      npmDownloads30d: projects.reduce(
        (total, project) => total + project.npmDownloads30d,
        0,
      ),
      openIssues: projects.reduce(
        (total, project) => total + project.openIssues,
        0,
      ),
      publicProjects: projects.filter(
        (project) => project.visibility === 'public',
      ).length,
    },
    sync: {
      completedAt: sync?.completedAt
        ? new Date(sync.completedAt).toISOString()
        : null,
      status: sync?.status ?? 'idle',
    },
  })
}
