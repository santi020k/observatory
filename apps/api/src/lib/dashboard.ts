import {
  type AnalyticsRange,
  type Dashboard,
  dashboardSchema,
  type ProjectDashboard,
  projectDashboardSchema,
  type ProjectMetric,
  type ProjectSettings,
  projectSettingsSchema,
} from '@santi020k/observatory-api-types'
import {
  createDb,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getProjectPreferences,
  getPublicSnapshotsSince,
  getSnapshotsForSyncRun,
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

import { buildWebsiteAnalytics } from './cloudflare'

type Snapshot = Awaited<ReturnType<typeof getSnapshotsForSyncRun>>[number]

type ProjectPreference = Pick<
  ProjectMetric,
  'attentionMode' | 'pinned' | 'websiteAnalyticsEnabled'
>

const defaultProjectPreference: ProjectPreference = {
  attentionMode: 'all',
  pinned: false,
  websiteAnalyticsEnabled: true,
}

const compareProjectRelevance = (
  left: { name: string; pinned?: boolean; relevanceScore: number },
  right: { name: string; pinned?: boolean; relevanceScore: number },
): number =>
  Number(right.pinned ?? false) - Number(left.pinned ?? false) ||
  right.relevanceScore - left.relevanceScore ||
  left.name.localeCompare(right.name)

const getRangeMilliseconds = (range: AnalyticsRange): number => {
  if (range === '30d') return 30 * 24 * 60 * 60 * 1_000

  if (range === '1y') return 365 * 24 * 60 * 60 * 1_000

  return 5 * 365 * 24 * 60 * 60 * 1_000
}

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

const toProjectMetric = (
  row: Snapshot,
  preference: ProjectPreference,
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
    website: row.websiteUrl,
  },
  stars: row.stars,
  status: row.status as ProjectMetric['status'],
  topics: parseStringArray(row.topics),
  visibility: row.visibility as ProjectMetric['visibility'],
  websiteAnalyticsEnabled: preference.websiteAnalyticsEnabled,
})

const sumNullable = (values: readonly (number | null)[]): number | null => {
  const available = values.filter((value): value is number => value !== null)

  return available.length > 0
    ? available.reduce((total, value) => total + value, 0)
    : null
}

const buildHistory = (rows: Snapshot[]) => {
  const groups = new Map<number, Snapshot[]>()

  for (const row of rows) {
    groups.set(row.collectedAt, [...(groups.get(row.collectedAt) ?? []), row])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([collectedAt, snapshots]) => ({
      collectedAt: new Date(collectedAt).toISOString(),
      githubViews14d: sumNullable(
        snapshots.map((snapshot) => snapshot.githubViews14d),
      ),
      npmDownloads30d: snapshots.reduce(
        (total, snapshot) => total + snapshot.npmDownloads30d,
        0,
      ),
      openIssues: snapshots.reduce(
        (total, snapshot) => total + snapshot.openIssues,
        0,
      ),
      stars: snapshots.reduce((total, snapshot) => total + snapshot.stars, 0),
    }))
}

const getPeriodSummary = (history: ReturnType<typeof buildHistory>) => {
  const first = history[0]
  const last = history[history.length - 1]

  return {
    issueChange: first && last ? last.openIssues - first.openIssues : 0,
    starsGained: first && last ? last.stars - first.stars : 0,
    syncs: history.length,
  }
}

const getDashboardRows = async (env: Bindings, range: AnalyticsRange) => {
  const database = createDb(env.DB)

  const [sync, latestSuccessfulSync, preferences] = await Promise.all([
    getLatestSyncRun(database),
    getLatestSuccessfulSyncRun(database),
    getProjectPreferences(database),
  ])

  const preferencesBySlug = new Map(
    preferences.map((preference) => [preference.slug, preference]),
  )

  const getPreference = (slug: string) => {
    const preference = preferencesBySlug.get(slug)

    return {
      attentionMode:
        preference?.attentionMode === 'health' ||
        preference?.attentionMode === 'off'
          ? preference.attentionMode
          : 'all',
      pinned: preference?.pinned ?? false,
      websiteAnalyticsEnabled: preference?.websiteAnalyticsEnabled ?? true,
    } satisfies ProjectPreference
  }

  const isEnabled = (slug: string) =>
    preferencesBySlug.get(slug)?.enabled !== false

  const [latestRows, historyRows] = await Promise.all([
    latestSuccessfulSync
      ? getSnapshotsForSyncRun(database, latestSuccessfulSync.id)
      : Promise.resolve([]),
    getPublicSnapshotsSince(database, Date.now() - getRangeMilliseconds(range)),
  ])

  return {
    historyRows: historyRows.filter((row) => isEnabled(row.slug)),
    getPreference,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    sync,
  }
}

export const buildDashboard = async (
  env: Bindings,
  range: AnalyticsRange = '30d',
): Promise<Dashboard> => {
  const {
    getPreference,
    historyRows,
    isEnabled,
    latestRows,
    latestSuccessfulSync,
    sync,
  } = await getDashboardRows(env, range)

  const projects = latestRows
    .filter((row) => isEnabled(row.slug))
    .map((row) => toProjectMetric(row, getPreference(row.slug)))
    .sort(compareProjectRelevance)

  const history = buildHistory(historyRows)

  return dashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    history,
    period: getPeriodSummary(history),
    projects,
    range,
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
      publicProjects: projects.length,
    },
    sync: {
      completedAt: latestSuccessfulSync?.completedAt
        ? new Date(latestSuccessfulSync.completedAt).toISOString()
        : null,
      status: sync?.status ?? 'idle',
    },
  })
}

export const buildProjectDashboard = async (
  env: Bindings,
  slug: string,
  range: AnalyticsRange = '30d',
): Promise<ProjectDashboard | null> => {
  const { getPreference, historyRows, isEnabled, latestRows } =
    await getDashboardRows(env, range)

  const row = latestRows.find((candidate) => candidate.slug === slug)

  if (!row || !isEnabled(slug)) return null

  const preference = getPreference(slug)

  const history = buildHistory(
    historyRows.filter((snapshot) => snapshot.slug === slug),
  )

  const websiteAnalytics =
    row.websiteUrl && preference.websiteAnalyticsEnabled
      ? ((await buildWebsiteAnalytics(env, range)).sites.find(
          (site) => site.slug === slug,
        ) ?? null)
      : null

  return projectDashboardSchema.parse({
    generatedAt: new Date().toISOString(),
    history,
    period: getPeriodSummary(history),
    project: toProjectMetric(row, preference),
    range,
    websiteAnalytics,
  })
}

export const buildProjectSettings = async (
  env: Bindings,
): Promise<ProjectSettings> => {
  const database = createDb(env.DB)

  const [latestSuccessfulSync, preferences] = await Promise.all([
    getLatestSuccessfulSyncRun(database),
    getProjectPreferences(database),
  ])

  const rows = latestSuccessfulSync
    ? await getSnapshotsForSyncRun(database, latestSuccessfulSync.id)
    : []

  const preferencesBySlug = new Map(
    preferences.map((preference) => [preference.slug, preference]),
  )

  return projectSettingsSchema.parse({
    projects: rows
      .map((row) => ({
        attentionMode:
          preferencesBySlug.get(row.slug)?.attentionMode === 'health' ||
          preferencesBySlug.get(row.slug)?.attentionMode === 'off'
            ? preferencesBySlug.get(row.slug)?.attentionMode
            : defaultProjectPreference.attentionMode,
        category: row.category,
        enabled: preferencesBySlug.get(row.slug)?.enabled !== false,
        hasWebsite: row.websiteUrl !== null,
        name: row.name,
        pinned: preferencesBySlug.get(row.slug)?.pinned ?? false,
        relevanceScore: row.relevanceScore,
        slug: row.slug,
        status: row.status as ProjectSettings['projects'][number]['status'],
        websiteAnalyticsEnabled:
          preferencesBySlug.get(row.slug)?.websiteAnalyticsEnabled ?? true,
      }))
      .sort(compareProjectRelevance),
  })
}
