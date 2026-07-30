import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Bindings } from '../env'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ database: 'test' })),
  buildWebsiteAnalytics: vi.fn(),
  getLatestSuccessfulSyncRun: vi.fn(),
  getLatestSyncRun: vi.fn(),
  getProjectPreferences: vi.fn(),
  getPublicSnapshotsSince: vi.fn(),
  getSnapshotsForSyncRun: vi.fn()
}))

vi.mock('./cloudflare', () => ({
  buildWebsiteAnalytics: mocks.buildWebsiteAnalytics
}))

vi.mock('@santi020k/observatory-db', async importOriginal => ({
  ...(await importOriginal()),
  createDb: mocks.createDb,
  getLatestSuccessfulSyncRun: mocks.getLatestSuccessfulSyncRun,
  getLatestSyncRun: mocks.getLatestSyncRun,
  getProjectPreferences: mocks.getProjectPreferences,
  getPublicSnapshotsSince: mocks.getPublicSnapshotsSince,
  getSnapshotsForSyncRun: mocks.getSnapshotsForSyncRun
}))

const { buildDashboard, buildProjectDashboard, buildProjectSettings } =
  await import('./dashboard')

const environment = {
  AUTH_SECRET: 'test-secret',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {} as D1Database,
  ENVIRONMENT: 'test',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com'
} satisfies Bindings

const websiteSnapshot = {
  archived: false,
  category: 'content',
  collectedAt: 1_000,
  description: 'Personal website',
  forks: 0,
  githubClones14d: 2,
  githubViews14d: 5,
  healthStatus: 'healthy',
  id: 'snapshot',
  latestVersion: null,
  name: 'Website',
  npmDownloads30d: 0,
  npmPackages: '[]',
  openIssues: 0,
  pushedAt: '2026-07-25T00:00:00Z',
  relevanceScore: 60,
  repositoryUrl: 'https://github.com/santi020k/website',
  responseTimeMs: 120,
  slug: 'website',
  stars: 1,
  status: 'active',
  syncRunId: 'successful-run',
  topics: '[]',
  visibility: 'public',
  websiteUrl: 'https://santi.dev'
}

const successfulSync = {
  completedAt: 1_500,
  id: 'successful-run',
  startedAt: 1_000,
  status: 'succeeded'
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.getSnapshotsForSyncRun.mockResolvedValue([])

  mocks.getProjectPreferences.mockResolvedValue([])

  mocks.getPublicSnapshotsSince.mockResolvedValue([])

  mocks.buildWebsiteAnalytics.mockResolvedValue({
    generatedAt: new Date(0).toISOString(),
    range: '30d',
    sites: []
  })
})

describe('project website analytics', () => {
  test('matches Cloudflare analytics to the project slug', async () => {
    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)

    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])

    mocks.buildWebsiteAnalytics.mockResolvedValue({
      generatedAt: new Date(0).toISOString(),
      range: '30d',
      sites: [
        {
          history: [
            {
              pageViews: 14,
              periodStart: '2026-07-25T00:00:00.000Z',
              sampleInterval: 1,
              visits: 9
            }
          ],
          hostname: 'santi.dev',
          pageViews: 14,
          slug: 'website',
          visits: 9
        }
      ]
    })

    const dashboard = await buildProjectDashboard(environment, 'website')

    expect(dashboard?.websiteAnalytics).toMatchObject({
      hostname: 'santi.dev',
      pageViews: 14,
      visits: 9
    })
  })

  test('does not return website analytics when collection is disabled', async () => {
    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)

    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])

    mocks.getProjectPreferences.mockResolvedValue([
      {
        attentionMode: 'all',
        enabled: true,
        pinned: false,
        slug: 'website',
        updatedAt: 2_000,
        websiteAnalyticsEnabled: false
      }
    ])

    const dashboard = await buildProjectDashboard(environment, 'website')

    expect(dashboard?.websiteAnalytics).toBeNull()

    expect(mocks.buildWebsiteAnalytics).not.toHaveBeenCalled()
  })
})

describe('project preferences', () => {
  test('pins projects and exposes attention preferences to dashboards', async () => {
    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)

    mocks.getSnapshotsForSyncRun.mockResolvedValue([
      websiteSnapshot,
      {
        ...websiteSnapshot,
        id: 'pinned-snapshot',
        name: 'Pinned project',
        relevanceScore: 10,
        slug: 'pinned',
        websiteUrl: null
      }
    ])

    mocks.getProjectPreferences.mockResolvedValue([
      {
        attentionMode: 'off',
        enabled: true,
        pinned: true,
        slug: 'pinned',
        updatedAt: 2_000,
        websiteAnalyticsEnabled: true
      }
    ])

    const dashboard = await buildDashboard(environment)

    expect(dashboard.projects[0]).toMatchObject({
      attentionMode: 'off',
      name: 'Pinned project',
      pinned: true
    })
  })

  test('returns every persisted control in project settings', async () => {
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)

    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])

    mocks.getProjectPreferences.mockResolvedValue([
      {
        attentionMode: 'health',
        enabled: true,
        pinned: true,
        slug: 'website',
        updatedAt: 2_000,
        websiteAnalyticsEnabled: false
      }
    ])

    const settings = await buildProjectSettings(environment)

    expect(settings.projects[0]).toMatchObject({
      attentionMode: 'health',
      enabled: true,
      hasWebsite: true,
      pinned: true,
      websiteAnalyticsEnabled: false
    })
  })
})

describe('dashboard snapshot selection', () => {
  test('reads one completed run consistently while reporting the latest failure', async () => {
    mocks.getLatestSyncRun.mockResolvedValue({
      completedAt: 3_000,
      id: 'failed-run',
      startedAt: 2_000,
      status: 'failed'
    })

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue({
      completedAt: 1_500,
      id: 'successful-run',
      startedAt: 1_000,
      status: 'succeeded'
    })

    const dashboard = await buildDashboard(environment)

    expect(mocks.getSnapshotsForSyncRun).toHaveBeenCalledWith(
      expect.anything(), 'successful-run'
    )

    expect(dashboard.sync).toEqual({
      completedAt: new Date(1_500).toISOString(),
      status: 'failed'
    })
  })

  test('queries genuinely different persisted windows for each range', async () => {
    const now = Date.UTC(2026, 6, 30)
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now)

    mocks.getLatestSyncRun.mockResolvedValue(null)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(null)

    await buildDashboard(environment, '5d')
    await buildDashboard(environment, '30d')

    expect(mocks.getPublicSnapshotsSince).toHaveBeenNthCalledWith(
      1, expect.anything(), now - 5 * 24 * 60 * 60 * 1_000
    )

    expect(mocks.getPublicSnapshotsSince).toHaveBeenNthCalledWith(
      2, expect.anything(), now - 30 * 24 * 60 * 60 * 1_000
    )

    dateSpy.mockRestore()
  })

  test('keeps the latest chart snapshot while measuring every raw sync', async () => {
    const first = Date.UTC(2026, 6, 28, 1)
    const firstLatest = Date.UTC(2026, 6, 28, 23)
    const last = Date.UTC(2026, 6, 29, 12)
    const lastSnapshot = {
      ...websiteSnapshot,
      collectedAt: last,
      id: 'last',
      npmDownloads30d: 30,
      stars: 4
    }

    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)
    mocks.getSnapshotsForSyncRun.mockResolvedValue([lastSnapshot])
    mocks.getPublicSnapshotsSince.mockResolvedValue([
      {
        ...websiteSnapshot,
        collectedAt: first,
        id: 'first',
        npmDownloads30d: 10,
        stars: 1
      },
      {
        ...websiteSnapshot,
        collectedAt: firstLatest,
        id: 'first-latest',
        npmDownloads30d: 20,
        stars: 2
      },
      lastSnapshot
    ])

    const dashboard = await buildDashboard(environment, '30d')

    expect(dashboard.history).toHaveLength(2)
    expect(dashboard.history[0]).toMatchObject({
      npmDownloads30d: 20,
      stars: 2
    })

    expect(dashboard.period).toMatchObject({
      availableFrom: new Date(first).toISOString(),
      availableTo: new Date(last).toISOString(),
      downloadVelocityChange: 20,
      starsGained: 3,
      syncs: 3
    })
  })

  test('does not let long-range chart buckets erase real growth', async () => {
    const first = Date.UTC(2026, 6, 1)
    const last = Date.UTC(2026, 6, 29)

    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)
    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])
    mocks.getPublicSnapshotsSince.mockResolvedValue([
      {
        ...websiteSnapshot,
        collectedAt: first,
        id: 'first',
        npmDownloads30d: 10,
        openIssues: 8,
        stars: 1
      },
      {
        ...websiteSnapshot,
        collectedAt: last,
        id: 'last',
        npmDownloads30d: 30,
        openIssues: 3,
        stars: 4
      }
    ])

    const dashboard = await buildDashboard(environment, '5y')

    expect(dashboard.history).toHaveLength(1)
    expect(dashboard.period).toMatchObject({
      downloadVelocityChange: 20,
      issueChange: -5,
      starsGained: 3,
      syncs: 2
    })
  })

  test('uses weekly chart buckets for the 90-day range', async () => {
    const week = 7 * 24 * 60 * 60 * 1_000
    const bucketStart = Math.floor(Date.UTC(2026, 6, 1) / week) * week
    const first = bucketStart + 24 * 60 * 60 * 1_000
    const threeDaysLater = first + 3 * 24 * 60 * 60 * 1_000

    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)
    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])
    mocks.getPublicSnapshotsSince.mockResolvedValue([
      { ...websiteSnapshot, collectedAt: first, id: 'first' },
      {
        ...websiteSnapshot,
        collectedAt: threeDaysLater,
        id: 'three-days-later'
      }
    ])

    const dashboard = await buildDashboard(environment, '90d')

    expect(dashboard.history).toHaveLength(1)
    expect(dashboard.period.syncs).toBe(2)
  })
})
