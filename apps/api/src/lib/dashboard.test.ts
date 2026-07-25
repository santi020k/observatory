import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bindings } from '../env'

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ database: 'test' })),
  getLatestSuccessfulSyncRun: vi.fn(),
  getLatestSyncRun: vi.fn(),
  getProjectPreferences: vi.fn(),
  getPublicSnapshotsSince: vi.fn(),
  getSnapshotsForSyncRun: vi.fn(),
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

const { buildDashboard } = await import('./dashboard')

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
