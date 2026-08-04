import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { Bindings } from '../env'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ database: 'test' })),
  buildWebsiteAnalytics: vi.fn(),
  getLatestSuccessfulSyncRun: vi.fn(),
  getLatestSyncRun: vi.fn(),
  getNpmDownloadsSince: vi.fn(),
  getProjectPreferences: vi.fn(),
  getPublicSnapshotsSince: vi.fn(),
  getSnapshotsForSyncRun: vi.fn(),
  getVscodeExtensionSnapshotsSince: vi.fn()
}))

vi.mock('./cloudflare', () => ({
  buildWebsiteAnalytics: mocks.buildWebsiteAnalytics
}))

vi.mock('@santi020k/observatory-db', async importOriginal => ({
  ...(await importOriginal()),
  createDb: mocks.createDb,
  getLatestSuccessfulSyncRun: mocks.getLatestSuccessfulSyncRun,
  getLatestSyncRun: mocks.getLatestSyncRun,
  getNpmDownloadsSince: mocks.getNpmDownloadsSince,
  getProjectPreferences: mocks.getProjectPreferences,
  getPublicSnapshotsSince: mocks.getPublicSnapshotsSince,
  getSnapshotsForSyncRun: mocks.getSnapshotsForSyncRun,
  getVscodeExtensionSnapshotsSince: mocks.getVscodeExtensionSnapshotsSince
}))

const {
  buildDashboard,
  buildOpenVsxAnalytics,
  buildNpmAnalytics,
  buildProjectDashboard,
  buildProjectSettings,
  buildVscodeAnalytics
} = await import('./dashboard')

const environment = {
  AUTH_SECRET: 'test-secret',
  OWNER_PASSCODE: 'test-recovery-code',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {} as D1Database,
  ENVIRONMENT: 'test',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  SITE_URL: 'https://observatory.example'
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

  mocks.getNpmDownloadsSince.mockResolvedValue([])

  mocks.getVscodeExtensionSnapshotsSince.mockResolvedValue([])

  mocks.buildWebsiteAnalytics.mockResolvedValue({
    generatedAt: new Date(0).toISOString(),
    range: '30d',
    sites: []
  })
})

describe('npm download analytics', () => {
  test('builds calendar aggregates and a ranked package table', () => {
    const analytics = buildNpmAnalytics([
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 30,
        id: 'lumen-1',
        packageName: '@santi020k/lumen',
        periodStart: Date.UTC(2026, 6, 26),
        slug: 'lumen'
      },
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 20,
        id: 'lumen-2',
        packageName: '@santi020k/lumen',
        periodStart: Date.UTC(2026, 6, 28),
        slug: 'lumen'
      },
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 80,
        id: 'observatory-1',
        packageName: '@santi020k/observatory',
        periodStart: Date.UTC(2026, 6, 28),
        slug: 'observatory'
      }
    ])

    expect(analytics).toMatchObject({
      totalDownloads: 130,
      weekly: [{ downloads: 30 }, { downloads: 100 }]
    })

    expect(analytics.packages[0]).toMatchObject({
      downloads: 80,
      packageName: '@santi020k/observatory'
    })
  })
})

describe('VS Code Marketplace analytics', () => {
  test('uses the latest extension snapshot and preserves portfolio history', () => {
    const first = Date.UTC(2026, 6, 29)
    const last = Date.UTC(2026, 6, 30)

    const analytics = buildVscodeAnalytics([
      {
        collectedAt: first,
        downloads: 100,
        extensionId: 'santi020k.vscode-astro-doctor',
        id: 'first',
        installs: 4,
        lastUpdated: '2026-07-27T00:00:00.000Z',
        provider: 'vscode-marketplace',
        rating: 4.5,
        reviewCount: 0,
        slug: 'astro-doctor',
        syncRunId: 'first-run',
        updateCount: 5,
        version: '1.2.1'
      },
      {
        collectedAt: last,
        downloads: 120,
        extensionId: 'santi020k.vscode-astro-doctor',
        id: 'last',
        installs: 5,
        lastUpdated: '2026-07-30T00:00:00.000Z',
        provider: 'vscode-marketplace',
        rating: 4.6,
        reviewCount: 0,
        slug: 'astro-doctor',
        syncRunId: 'last-run',
        updateCount: 6,
        version: '1.2.2'
      }
    ])

    expect(analytics).toMatchObject({
      extensions: [
        {
          downloads: 120,
          extensionId: 'santi020k.vscode-astro-doctor',
          installs: 5,
          version: '1.2.2'
        }
      ],
      totalDownloads: 120,
      totalInstalls: 5
    })

    expect(analytics.history).toHaveLength(2)
  })

  test('keeps Open VSX downloads separate from Microsoft Marketplace data', () => {
    const analytics = buildOpenVsxAnalytics([
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 1_280,
        extensionId: 'santi020k.vscode-astro-doctor',
        id: 'open-vsx',
        installs: 0,
        lastUpdated: '2026-07-27T01:40:02.517Z',
        provider: 'open-vsx',
        rating: null,
        reviewCount: 0,
        slug: 'astro-doctor',
        syncRunId: 'sync-run',
        updateCount: 0,
        version: '1.2.2'
      },
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 166,
        extensionId: 'santi020k.vscode-astro-doctor',
        id: 'vscode',
        installs: 5,
        lastUpdated: '2026-07-27T01:44:14.250Z',
        provider: 'vscode-marketplace',
        rating: 4.5,
        reviewCount: 0,
        slug: 'astro-doctor',
        syncRunId: 'sync-run',
        updateCount: 7,
        version: '1.2.2'
      }
    ])

    expect(analytics).toMatchObject({
      extensions: [{
        downloads: 1_280,
        extensionId: 'santi020k.vscode-astro-doctor'
      }],
      totalDownloads: 1_280
    })
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
    const now = Date.UTC(2026, 6, 30, 12)
    const todayStart = Date.UTC(2026, 6, 30)
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

    expect(mocks.getNpmDownloadsSince).toHaveBeenNthCalledWith(
      1, expect.anything(), todayStart - 5 * 24 * 60 * 60 * 1_000
    )

    expect(mocks.getNpmDownloadsSince).toHaveBeenNthCalledWith(
      2, expect.anything(), todayStart - 30 * 24 * 60 * 60 * 1_000
    )

    expect(mocks.getVscodeExtensionSnapshotsSince).toHaveBeenNthCalledWith(
      1, expect.anything(), now - 5 * 24 * 60 * 60 * 1_000
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
    const wednesday = Date.UTC(2026, 6, 1)
    const thursday = Date.UTC(2026, 6, 2)

    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)
    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])
    mocks.getPublicSnapshotsSince.mockResolvedValue([
      { ...websiteSnapshot, collectedAt: wednesday, id: 'wednesday' },
      {
        ...websiteSnapshot,
        collectedAt: thursday,
        id: 'thursday'
      }
    ])

    const dashboard = await buildDashboard(environment, '90d')

    expect(dashboard.history).toHaveLength(1)
    expect(dashboard.period.syncs).toBe(2)
  })

  test('returns selected-range npm analytics for a project dashboard', async () => {
    mocks.getLatestSyncRun.mockResolvedValue(successfulSync)
    mocks.getLatestSuccessfulSyncRun.mockResolvedValue(successfulSync)
    mocks.getSnapshotsForSyncRun.mockResolvedValue([websiteSnapshot])
    mocks.getNpmDownloadsSince.mockResolvedValue([
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 42,
        id: 'website-downloads',
        packageName: '@santi020k/website',
        periodStart: Date.UTC(2026, 6, 29),
        slug: 'website'
      },
      {
        collectedAt: Date.UTC(2026, 6, 30),
        downloads: 99,
        id: 'other-downloads',
        packageName: '@santi020k/other',
        periodStart: Date.UTC(2026, 6, 29),
        slug: 'other'
      }
    ])

    const dashboard = await buildProjectDashboard(environment, 'website', '5d')

    expect(dashboard?.npmAnalytics).toMatchObject({
      packages: [
        {
          downloads: 42,
          packageName: '@santi020k/website',
          slug: 'website'
        }
      ],
      totalDownloads: 42
    })
  })
})
