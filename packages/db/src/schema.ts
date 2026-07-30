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
