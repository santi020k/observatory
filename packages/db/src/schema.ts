import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

export const authCodes = sqliteTable('auth_codes', {
  attempts: integer('attempts').notNull().default(0),
  codeHash: text('code_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  email: text('email').notNull(),
  expiresAt: integer('expires_at').notNull(),
  id: text('id').primaryKey(),
  usedAt: integer('used_at')
})

export const sessions = sqliteTable('sessions', {
  createdAt: integer('created_at').notNull(),
  email: text('email').notNull(),
  expiresAt: integer('expires_at').notNull(),
  id: text('id').primaryKey(),
  lastSeenAt: integer('last_seen_at').notNull(),
  tokenHash: text('token_hash').notNull().unique()
})

export const authAttempts = sqliteTable(
  'auth_attempts', {
    createdAt: integer('created_at').notNull(),
    id: text('id').primaryKey(),
    identity: text('identity').notNull(),
    succeeded: integer('succeeded', { mode: 'boolean' }).notNull()
  }, table => [index('auth_attempts_identity_created_idx').on(
    table.identity, table.createdAt
  )]
)

export const passkeyCredentials = sqliteTable('passkey_credentials', {
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
  counter: integer('counter').notNull(),
  createdAt: integer('created_at').notNull(),
  deviceType: text('device_type', {
    enum: ['singleDevice', 'multiDevice']
  }).notNull(),
  id: text('id').primaryKey(),
  lastUsedAt: integer('last_used_at'),
  name: text('name').notNull(),
  publicKey: text('public_key').notNull(),
  transports: text('transports').notNull().default('[]')
})

export const passkeyChallenges = sqliteTable(
  'passkey_challenges', {
    challenge: text('challenge').notNull(),
    expiresAt: integer('expires_at').notNull(),
    id: text('id').primaryKey(),
    ownerEmail: text('owner_email'),
    purpose: text('purpose', {
      enum: ['authentication', 'registration']
    }).notNull(),
    usedAt: integer('used_at')
  }, table => [index('passkey_challenges_expires_idx').on(table.expiresAt)]
)

export const syncRuns = sqliteTable('sync_runs', {
  completedAt: integer('completed_at'),
  errorMessage: text('error_message'),
  id: text('id').primaryKey(),
  projectCount: integer('project_count').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  status: text('status').notNull()
})

export const projectSnapshots = sqliteTable(
  'project_snapshots', {
    archived: integer('archived', { mode: 'boolean' }).notNull(),
    category: text('category').notNull(),
    collectedAt: integer('collected_at').notNull(),
    description: text('description'),
    forks: integer('forks').notNull().default(0),
    githubClones14d: integer('github_clones_14d'),
    githubViews14d: integer('github_views_14d'),
    healthStatus: text('health_status').notNull().default('unknown'),
    id: text('id').primaryKey(),
    latestVersion: text('latest_version'),
    name: text('name').notNull(),
    npmDownloads30d: integer('npm_downloads_30d').notNull().default(0),
    npmPackages: text('npm_packages').notNull().default('[]'),
    openIssues: integer('open_issues').notNull().default(0),
    pushedAt: text('pushed_at'),
    relevanceScore: integer('relevance_score').notNull().default(0),
    repositoryUrl: text('repository_url').notNull(),
    responseTimeMs: integer('response_time_ms'),
    slug: text('slug').notNull(),
    stars: integer('stars').notNull().default(0),
    status: text('status').notNull(),
    syncRunId: text('sync_run_id').references(() => syncRuns.id),
    topics: text('topics').notNull().default('[]'),
    visibility: text('visibility').notNull().default('public'),
    websiteUrl: text('website_url')
  }, table => [
    index('project_snapshots_visibility_collected_idx').on(
      table.visibility, table.collectedAt
    ),
    index('project_snapshots_slug_collected_idx').on(
      table.slug, table.collectedAt
    )
  ]
)

export const npmDownloadSnapshots = sqliteTable(
  'npm_download_snapshots', {
    collectedAt: integer('collected_at').notNull(),
    downloads: integer('downloads').notNull().default(0),
    id: text('id').primaryKey(),
    packageName: text('package_name').notNull(),
    periodStart: integer('period_start').notNull(),
    slug: text('slug').notNull()
  }, table => [
    index('npm_download_snapshots_period_idx').on(table.periodStart),
    index('npm_download_snapshots_slug_period_idx').on(
      table.slug, table.periodStart
    ),
    uniqueIndex('npm_download_snapshots_package_period_idx').on(
      table.packageName, table.periodStart
    )
  ]
)

export const vscodeExtensionSnapshots = sqliteTable(
  'vscode_extension_snapshots', {
    collectedAt: integer('collected_at').notNull(),
    downloads: integer('downloads').notNull().default(0),
    extensionId: text('extension_id').notNull(),
    id: text('id').primaryKey(),
    installs: integer('installs').notNull().default(0),
    lastUpdated: text('last_updated').notNull(),
    provider: text('provider').notNull(),
    rating: real('rating'),
    reviewCount: integer('review_count').notNull().default(0),
    slug: text('slug').notNull(),
    syncRunId: text('sync_run_id').references(() => syncRuns.id),
    updateCount: integer('update_count').notNull().default(0),
    version: text('version').notNull()
  }, table => [
    index('vscode_extension_snapshots_collected_idx').on(table.collectedAt),
    index('vscode_extension_snapshots_slug_collected_idx').on(
      table.slug, table.collectedAt
    ),
    uniqueIndex('vscode_extension_snapshots_provider_extension_run_idx').on(
      table.provider, table.extensionId, table.syncRunId
    )
  ]
)

export const releaseAssetSnapshots = sqliteTable(
  'release_asset_snapshots', {
    assetId: text('asset_id').notNull(),
    assetName: text('asset_name').notNull(),
    channel: text('channel').notNull(),
    collectedAt: integer('collected_at').notNull(),
    downloads: integer('downloads').notNull().default(0),
    id: text('id').primaryKey(),
    releaseTag: text('release_tag').notNull(),
    repository: text('repository').notNull(),
    slug: text('slug').notNull(),
    syncRunId: text('sync_run_id').references(() => syncRuns.id)
  }, table => [
    index('release_asset_snapshots_collected_idx').on(table.collectedAt),
    index('release_asset_snapshots_slug_collected_idx').on(
      table.slug, table.collectedAt
    ),
    uniqueIndex('release_asset_snapshots_asset_run_idx').on(
      table.repository, table.assetId, table.syncRunId
    )
  ]
)

export const storeMetricPoints = sqliteTable(
  'store_metric_points', {
    appSlug: text('app_slug').notNull(),
    collectedAt: integer('collected_at').notNull(),
    dimension: text('dimension', {
      enum: ['appVersion', 'country', 'device', 'osVersion', 'overall']
    }).notNull(),
    dimensionValue: text('dimension_value').notNull(),
    id: text('id').primaryKey(),
    metric: text('metric').notNull(),
    periodStart: integer('period_start').notNull(),
    provider: text('provider', { enum: ['apple', 'google'] }).notNull(),
    source: text('source').notNull(),
    value: real('value').notNull()
  }, table => [
    index('store_metric_points_app_period_idx').on(
      table.appSlug, table.periodStart
    ),
    index('store_metric_points_provider_period_idx').on(
      table.provider, table.periodStart
    ),
    uniqueIndex('store_metric_points_fact_idx').on(
      table.appSlug,
      table.provider,
      table.periodStart,
      table.metric,
      table.dimension,
      table.dimensionValue
    )
  ]
)

export const storeSyncRuns = sqliteTable(
  'store_sync_runs', {
    appSlug: text('app_slug').notNull(),
    completedAt: integer('completed_at'),
    errorCode: text('error_code'),
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['apple', 'google'] }).notNull(),
    records: integer('records').notNull().default(0),
    startedAt: integer('started_at').notNull(),
    status: text('status', {
      enum: ['failed', 'skipped', 'succeeded']
    }).notNull()
  }, table => [
    index('store_sync_runs_app_provider_started_idx').on(
      table.appSlug, table.provider, table.startedAt
    )
  ]
)

export const projectPreferences = sqliteTable('project_preferences', {
  attentionMode: text('attention_mode').notNull().default('all'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  slug: text('slug').primaryKey(),
  updatedAt: integer('updated_at').notNull(),
  websiteAnalyticsEnabled: integer('website_analytics_enabled', {
    mode: 'boolean'
  })
    .notNull()
    .default(true)
})

export const websiteAnalyticsSnapshots = sqliteTable(
  'website_analytics_snapshots', {
    collectedAt: integer('collected_at').notNull(),
    hostname: text('hostname').notNull(),
    id: text('id').primaryKey(),
    pageViews: integer('page_views').notNull().default(0),
    periodEnd: integer('period_end').notNull(),
    periodStart: integer('period_start').notNull(),
    sampleInterval: real('sample_interval').notNull().default(1),
    slug: text('slug').notNull(),
    visits: integer('visits').notNull().default(0)
  }, table => [
    index('website_analytics_period_idx').on(table.periodStart),
    uniqueIndex('website_analytics_slug_period_idx').on(
      table.slug, table.periodStart
    )
  ]
)

export const feedbackItems = sqliteTable(
  'feedback_items', {
    contactEmail: text('contact_email'),
    createdAt: integer('created_at').notNull(),
    description: text('description').notNull(),
    diagnosticReport: text('diagnostic_report'),
    id: text('id').primaryKey(),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    locale: text('locale').notNull(),
    moderationStatus: text('moderation_status', {
      enum: ['pending', 'approved', 'rejected']
    }).notNull().default('pending'),
    projectSlug: text('project_slug').notNull(),
    source: text('source', {
      enum: ['android', 'ios', 'website']
    }).notNull(),
    status: text('status', {
      enum: ['inbox', 'under_review', 'planned', 'in_progress', 'shipped', 'closed']
    }).notNull().default('inbox'),
    title: text('title').notNull(),
    type: text('type', { enum: ['idea', 'bug', 'message'] }).notNull(),
    updatedAt: integer('updated_at').notNull(),
    voteCount: integer('vote_count').notNull().default(0)
  }, table => [
    index('feedback_items_public_feed').on(
      table.projectSlug, table.type, table.moderationStatus, table.isPublic, table.status
    ),
    index('feedback_items_admin_board').on(
      table.projectSlug, table.status, table.updatedAt
    )
  ]
)

export const feedbackVotes = sqliteTable(
  'feedback_votes', {
    createdAt: integer('created_at').notNull(),
    itemId: text('item_id').notNull().references(
      () => feedbackItems.id, { onDelete: 'cascade' }
    ),
    voterHash: text('voter_hash').notNull()
  }, table => [
    uniqueIndex('feedback_votes_item_voter_idx').on(
      table.itemId, table.voterHash
    ),
    index('feedback_votes_voter').on(table.voterHash, table.itemId)
  ]
)

export const feedbackRateLimits = sqliteTable(
  'feedback_rate_limits', {
    action: text('action').notNull(),
    keyHash: text('key_hash').notNull(),
    requestCount: integer('request_count').notNull().default(1),
    windowStart: text('window_start').notNull()
  }, table => [
    uniqueIndex('feedback_rate_limits_key_action_window_idx').on(
      table.keyHash, table.action, table.windowStart
    )
  ]
)
