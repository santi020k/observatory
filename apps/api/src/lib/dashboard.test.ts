import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from '../env'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ database: 'test' })),
  buildWebsiteAnalytics: vi.fn(),
  getLatestSuccessfulSyncRun: vi.fn(),
  getLatestSyncRun: vi.fn(),
  getProjectPreferences: vi.fn(),
  getPublicSnapshotsSince: vi.fn(),
  getSnapshotsForSyncRun: vi.fn(),
}))

vi.mock('./cloudflare', () => ({
  buildWebsiteAnalytics: mocks.buildWebsiteAnalytics,
}))

vi.mock('@santi020k/observatory-db', async (importOriginal) => ({
  ...(await importOriginal()),
  createDb: mocks.createDb,
  getLatestSuccessfulSyncRun: mocks.getLatestSuccessfulSyncRun,
  getLatestSyncRun: mocks.getLatestSyncRun,
  getProjectPreferences: mocks.getProjectPreferences,
  getPublicSnapshotsSince: mocks.getPublicSnapshotsSince,
  getSnapshotsForSyncRun: mocks.getSnapshotsForSyncRun,
}))

const { buildDashboard, buildProjectDashboard } = await import('./dashboard')

const environment = {
  AUTH_SECRET: 'test-secret',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {} as D1Database,
  ENVIRONMENT: 'test',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com',
} satisfies Bindings

beforeEach(() => {
  vi.clearAllMocks()

  mocks.getSnapshotsForSyncRun.mockResolvedValue([])

  mocks.getProjectPreferences.mockResolvedValue([])

  mocks.getPublicSnapshotsSince.mockResolvedValue([])

  mocks.buildWebsiteAnalytics.mockResolvedValue({
    generatedAt: new Date(0).toISOString(),
    range: '30d',
    sites: [],
  })
})

describe('project website analytics', () => {
  it('matches Cloudflare analytics to the project slug', async () => {
    mocks.getLatestSyncRun.mockResolvedValue({
      completedAt: 1_500,
      id: 'successful-run',
      startedAt: 1_000,
      status: 'succeeded',
    })

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue({
      completedAt: 1_500,
      id: 'successful-run',
      startedAt: 1_000,
      status: 'succeeded',
    })

    mocks.getSnapshotsForSyncRun.mockResolvedValue([
      {
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
        repositoryUrl: 'https://github.com/santi020k/website',
        responseTimeMs: 120,
        slug: 'website',
        stars: 1,
        status: 'active',
        syncRunId: 'successful-run',
        topics: '[]',
        visibility: 'public',
        websiteUrl: 'https://santi.dev',
      },
    ])

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
              visits: 9,
            },
          ],
          hostname: 'santi.dev',
          pageViews: 14,
          slug: 'website',
          visits: 9,
        },
      ],
    })

    const dashboard = await buildProjectDashboard(environment, 'website')

    expect(dashboard?.websiteAnalytics).toMatchObject({
      hostname: 'santi.dev',
      pageViews: 14,
      visits: 9,
    })
  })
})

describe('dashboard snapshot selection', () => {
  it('reads one completed run consistently while reporting the latest failure', async () => {
    mocks.getLatestSyncRun.mockResolvedValue({
      completedAt: 3_000,
      id: 'failed-run',
      startedAt: 2_000,
      status: 'failed',
    })

    mocks.getLatestSuccessfulSyncRun.mockResolvedValue({
      completedAt: 1_500,
      id: 'successful-run',
      startedAt: 1_000,
      status: 'succeeded',
    })

    const dashboard = await buildDashboard(environment)

    expect(mocks.getSnapshotsForSyncRun).toHaveBeenCalledWith(
      expect.anything(),
      'successful-run',
    )

    expect(dashboard.sync).toEqual({
      completedAt: new Date(1_500).toISOString(),
      status: 'failed',
    })
  })
})
