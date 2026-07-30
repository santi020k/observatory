import { getTableName } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'

import {
  authCodes,
  npmDownloadSnapshots,
  projectPreferences,
  projectSnapshots,
  sessions,
  syncRuns,
  websiteAnalyticsSnapshots
} from './schema'

describe('observatory database schema', () => {
  test('keeps authentication and analytics in separate tables', () => {
    expect(getTableName(authCodes)).toBe('auth_codes')

    expect(getTableName(sessions)).toBe('sessions')

    expect(getTableName(projectSnapshots)).toBe('project_snapshots')

    expect(getTableName(npmDownloadSnapshots)).toBe('npm_download_snapshots')

    expect(getTableName(syncRuns)).toBe('sync_runs')

    expect(getTableName(websiteAnalyticsSnapshots)).toBe(
      'website_analytics_snapshots'
    )
  })

  test('stores exact npm downloads separately from rolling project metrics', () => {
    expect(npmDownloadSnapshots.packageName.name).toBe('package_name')

    expect(npmDownloadSnapshots.periodStart.name).toBe('period_start')
  })

  test('stores visibility on every project snapshot', () => {
    expect(projectSnapshots.visibility.name).toBe('visibility')

    expect(projectSnapshots.visibility.notNull).toBe(true)
  })

  test('associates snapshots with the sync run that produced them', () => {
    expect(projectSnapshots.syncRunId.name).toBe('sync_run_id')
  })

  test('stores the calculated relevance score with every snapshot', () => {
    expect(projectSnapshots.relevanceScore.name).toBe('relevance_score')

    expect(projectSnapshots.relevanceScore.notNull).toBe(true)
  })

  test('stores project-specific navigation and collection preferences', () => {
    expect(projectPreferences.attentionMode.name).toBe('attention_mode')

    expect(projectPreferences.pinned.name).toBe('pinned')

    expect(projectPreferences.websiteAnalyticsEnabled.name).toBe(
      'website_analytics_enabled'
    )
  })
})
