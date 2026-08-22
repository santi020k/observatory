import { getTableName } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'

import {
  authAttempts,
  authCodes,
  feedbackItems,
  feedbackRateLimits,
  feedbackVotes,
  npmDownloadSnapshots,
  passkeyChallenges,
  passkeyCredentials,
  projectPreferences,
  projectSnapshots,
  releaseAssetSnapshots,
  sessions,
  syncRuns,
  vscodeExtensionSnapshots,
  websiteAnalyticsSnapshots
} from './schema'

describe('observatory database schema', () => {
  test('keeps authentication and analytics in separate tables', () => {
    expect(getTableName(authCodes)).toBe('auth_codes')

    expect(getTableName(sessions)).toBe('sessions')

    expect(getTableName(projectSnapshots)).toBe('project_snapshots')

    expect(getTableName(releaseAssetSnapshots)).toBe(
      'release_asset_snapshots'
    )

    expect(getTableName(npmDownloadSnapshots)).toBe('npm_download_snapshots')

    expect(getTableName(syncRuns)).toBe('sync_runs')

    expect(getTableName(vscodeExtensionSnapshots)).toBe(
      'vscode_extension_snapshots'
    )

    expect(getTableName(websiteAnalyticsSnapshots)).toBe(
      'website_analytics_snapshots'
    )
  })

  test('keeps passkey material and one-time challenges separate', () => {
    expect(getTableName(passkeyCredentials)).toBe('passkey_credentials')
    expect(getTableName(passkeyChallenges)).toBe('passkey_challenges')
    expect(getTableName(authAttempts)).toBe('auth_attempts')
  })

  test('stores exact npm downloads separately from rolling project metrics', () => {
    expect(npmDownloadSnapshots.packageName.name).toBe('package_name')

    expect(npmDownloadSnapshots.periodStart.name).toBe('period_start')
  })

  test('stores Marketplace snapshots with their source identity', () => {
    expect(vscodeExtensionSnapshots.extensionId.name).toBe('extension_id')

    expect(vscodeExtensionSnapshots.provider.name).toBe('provider')

    expect(vscodeExtensionSnapshots.syncRunId.name).toBe('sync_run_id')
  })

  test('stores cumulative release downloads with channel identity', () => {
    expect(releaseAssetSnapshots.assetId.name).toBe('asset_id')
    expect(releaseAssetSnapshots.channel.name).toBe('channel')
    expect(releaseAssetSnapshots.syncRunId.name).toBe('sync_run_id')
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

  test('keeps project feedback, votes, and abuse controls separate', () => {
    expect(getTableName(feedbackItems)).toBe('feedback_items')
    expect(getTableName(feedbackVotes)).toBe('feedback_votes')
    expect(getTableName(feedbackRateLimits)).toBe('feedback_rate_limits')
    expect(feedbackItems.projectSlug.notNull).toBe(true)
  })
})
