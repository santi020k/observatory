import * as z from 'zod'

export const feedbackStatusSchema = z.enum([
  'inbox',
  'under_review',
  'planned',
  'in_progress',
  'shipped',
  'closed'
])

export const feedbackTypeSchema = z.enum(['idea', 'bug', 'message'])
export const feedbackModerationStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected'
])

const feedbackBaseSchema = z.object({
  description: z.string().trim().min(20).max(2000),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .or(z.literal(''))
    .optional(),
  locale: z.string().trim().min(2).max(12),
  title: z.string().trim().min(5).max(120),
  type: feedbackTypeSchema
})

export const createFeedbackSchema = feedbackBaseSchema
  .extend({
    diagnosticReport: z.string().trim().max(20_000).optional(),
    source: z.enum(['android', 'ios', 'website']).default('website'),
    turnstileToken: z.string().trim().optional(),
    website: z.string().trim().max(0).optional()
  })
  .superRefine((value, context) => {
    if (
      value.type === 'bug' &&
      value.source !== 'website' &&
      !value.diagnosticReport
    )
      context.addIssue({
        code: 'custom',
        message: 'Native bug reports require diagnostics.',
        path: ['diagnosticReport']
      })

    if (value.type !== 'bug' && value.diagnosticReport)
      context.addIssue({
        code: 'custom',
        message: 'Diagnostics are accepted only for bug reports.',
        path: ['diagnosticReport']
      })
  })

export const updateFeedbackSchema = z
  .object({
    isPublic: z.boolean().optional(),
    moderationStatus: feedbackModerationStatusSchema.optional(),
    status: feedbackStatusSchema.optional()
  })
  .refine(
    value => value.isPublic !== undefined ||
      value.moderationStatus !== undefined ||
      value.status !== undefined,
    { error: 'At least one feedback update is required.' }
  )

export const publicFeedbackItemSchema = z.object({
  createdAt: z.string().trim(),
  description: z.string().trim(),
  hasVoted: z.boolean(),
  id: z.string().trim(),
  locale: z.string().trim(),
  status: feedbackStatusSchema,
  title: z.string().trim(),
  updatedAt: z.string().trim(),
  voteCount: z.int().nonnegative()
})

export const adminFeedbackItemSchema = publicFeedbackItemSchema
  .omit({
    hasVoted: true
  })
  .extend({
    diagnosticReport: z.string().trim().nullable(),
    email: z.string().trim().nullable(),
    isPublic: z.boolean(),
    moderationStatus: feedbackModerationStatusSchema,
    projectSlug: z.string().trim(),
    source: z.enum(['android', 'ios', 'website']),
    type: feedbackTypeSchema
  })

export const feedbackProjectSchema = z.object({
  displayName: z.string().trim(),
  locales: z.array(z.string().trim()),
  slug: z.string().trim(),
  turnstileEnabled: z.boolean(),
  turnstileSiteKey: z.string().trim().nullable()
})

export type AdminFeedbackItem = z.infer<typeof adminFeedbackItemSchema>
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type FeedbackProject = z.infer<typeof feedbackProjectSchema>
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>
export type FeedbackType = z.infer<typeof feedbackTypeSchema>
export type PublicFeedbackItem = z.infer<typeof publicFeedbackItemSchema>
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>

export const projectSourceSchema = z.object({
  github: z.string().trim(),
  npm: z.array(z.string().trim()).default([]),
  openVsx: z.array(z.url()).default([]),
  vscode: z.array(z.url()).default([]),
  website: z.url().nullable()
})

export const projectAttentionModeSchema = z.enum(['all', 'health', 'off'])

export const projectMetricSchema = z.object({
  attentionMode: projectAttentionModeSchema,
  archived: z.boolean(),
  category: z.enum(['app', 'content', 'library', 'tool']),
  description: z.string().trim().nullable(),
  forks: z.int().nonnegative(),
  githubClones14d: z.int().nonnegative().nullable(),
  githubViews14d: z.int().nonnegative().nullable(),
  healthStatus: z.enum(['healthy', 'degraded', 'unknown']),
  latestVersion: z.string().trim().nullable(),
  name: z.string().trim(),
  npmDownloads30d: z.int().nonnegative(),
  openIssues: z.int().nonnegative(),
  pinned: z.boolean(),
  pushedAt: z.string().trim().nullable(),
  relevanceScore: z.int().min(0).max(100),
  responseTimeMs: z.int().nonnegative().nullable(),
  slug: z.string().trim(),
  sources: projectSourceSchema,
  stars: z.int().nonnegative(),
  status: z.enum(['active', 'archived', 'maintained', 'paused']),
  topics: z.array(z.string().trim()),
  visibility: z.enum(['private', 'public']),
  websiteAnalyticsEnabled: z.boolean()
})

export const analyticsRangeSchema = z.enum([
  '5d',
  '30d',
  '90d',
  'ytd',
  '1y',
  '5y'
])

export const historyPointSchema = z.object({
  collectedAt: z.string().trim(),
  githubViews14d: z.int().nonnegative().nullable(),
  npmDownloads30d: z.int().nonnegative(),
  openIssues: z.int().nonnegative(),
  stars: z.int().nonnegative()
})

export const periodSummarySchema = z.object({
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  downloadVelocityChange: z.int(),
  issueChange: z.int(),
  starsGained: z.int(),
  syncs: z.int().nonnegative()
})

export const operationalHealthSchema = z.object({
  availabilityPercent: z.number().min(0).max(100).nullable(),
  availabilityTarget: z.number().min(0).max(100),
  consecutiveFailures: z.int().nonnegative(),
  currentStatus: z.enum(['degraded', 'healthy', 'unknown']),
  failedChecks: z.int().nonnegative(),
  healthyChecks: z.int().nonnegative(),
  lastCheckedAt: z.string().trim().nullable(),
  lastOutageStartedAt: z.string().trim().nullable(),
  lastRecoveredAt: z.string().trim().nullable(),
  latencyP50Ms: z.int().nonnegative().nullable(),
  latencyP95Ms: z.int().nonnegative().nullable(),
  meetsTarget: z.boolean().nullable(),
  observations: z.int().nonnegative(),
  slug: z.string().trim()
})

export const projectGrowthSignalSchema = z.enum([
  'accelerating',
  'growing',
  'insufficient',
  'slowing',
  'steady'
])

export const projectGrowthSchema = z.object({
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  downloadVelocityChange: z.int(),
  downloadVelocityPercent: z.number().nullable(),
  issueChange: z.int(),
  npmDownloads30dTrend: z.array(z.int().nonnegative()).max(24),
  observations: z.int().nonnegative(),
  signal: projectGrowthSignalSchema,
  slug: z.string().trim(),
  starsGained: z.int()
})

export const syncStateSchema = z.object({
  completedAt: z.string().trim().nullable(),
  status: z.enum(['failed', 'idle', 'running', 'succeeded'])
})

export const npmDownloadPointSchema = z.object({
  downloads: z.int().nonnegative(),
  periodStart: z.string().trim()
})

export const npmPackageDownloadsSchema = z.object({
  downloads: z.int().nonnegative(),
  packageName: z.string().trim(),
  slug: z.string().trim()
})

export const npmAnalyticsSchema = z.object({
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  daily: z.array(npmDownloadPointSchema),
  monthly: z.array(npmDownloadPointSchema),
  packages: z.array(npmPackageDownloadsSchema),
  totalDownloads: z.int().nonnegative(),
  weekly: z.array(npmDownloadPointSchema),
  yearly: z.array(npmDownloadPointSchema)
})

export const releaseDownloadChannelSchema = z.enum([
  'homebrew',
  'homebrew-or-update',
  'direct',
  'update',
  'website'
])

export const releaseAssetDownloadSchema = z.object({
  assetName: z.string().trim(),
  channel: releaseDownloadChannelSchema,
  downloads: z.int().nonnegative(),
  releaseTag: z.string().trim()
})

export const releaseChannelDownloadsSchema = z.object({
  channel: releaseDownloadChannelSchema,
  downloads: z.int().nonnegative()
})

export const releaseDownloadPointSchema = z.object({
  collectedAt: z.string().trim(),
  downloads: z.int().nonnegative()
})

export const releaseAnalyticsSchema = z.object({
  assets: z.array(releaseAssetDownloadSchema),
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  channels: z.array(releaseChannelDownloadsSchema),
  downloadsGained: z.int().nonnegative(),
  history: z.array(releaseDownloadPointSchema),
  totalDownloads: z.int().nonnegative()
})

export const vscodeExtensionSchema = z.object({
  downloads: z.int().nonnegative(),
  extensionId: z.string().trim(),
  installs: z.int().nonnegative(),
  lastUpdated: z.string().trim(),
  rating: z.number().nonnegative().nullable(),
  slug: z.string().trim(),
  updateCount: z.int().nonnegative(),
  version: z.string().trim()
})

export const openVsxExtensionSchema = z.object({
  downloads: z.int().nonnegative(),
  extensionId: z.string().trim(),
  lastUpdated: z.string().trim(),
  rating: z.number().nonnegative().nullable(),
  reviewCount: z.int().nonnegative(),
  slug: z.string().trim(),
  version: z.string().trim()
})

export const vscodeAnalyticsPointSchema = z.object({
  collectedAt: z.string().trim(),
  downloads: z.int().nonnegative(),
  installs: z.int().nonnegative()
})

export const openVsxAnalyticsSchema = z.object({
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  extensions: z.array(openVsxExtensionSchema),
  history: z.array(
    vscodeAnalyticsPointSchema.pick({ collectedAt: true, downloads: true })
  ),
  totalDownloads: z.int().nonnegative()
})

export const vscodeAnalyticsSchema = z.object({
  availableFrom: z.string().trim().nullable(),
  availableTo: z.string().trim().nullable(),
  extensions: z.array(vscodeExtensionSchema),
  history: z.array(vscodeAnalyticsPointSchema),
  totalDownloads: z.int().nonnegative(),
  totalInstalls: z.int().nonnegative()
})

export const dashboardSchema = z.object({
  generatedAt: z.string().trim(),
  growth: z.array(projectGrowthSchema),
  history: z.array(historyPointSchema),
  npmAnalytics: npmAnalyticsSchema,
  openVsxAnalytics: openVsxAnalyticsSchema,
  operationalHealth: z.array(operationalHealthSchema),
  period: periodSummarySchema,
  projects: z.array(projectMetricSchema),
  range: analyticsRangeSchema,
  releaseAnalytics: releaseAnalyticsSchema,
  summary: z.object({
    activeProjects: z.int().nonnegative(),
    githubClones14d: z.int().nonnegative().nullable(),
    githubViews14d: z.int().nonnegative().nullable(),
    npmDownloads30d: z.int().nonnegative(),
    openIssues: z.int().nonnegative(),
    publicProjects: z.int().nonnegative()
  }),
  sync: syncStateSchema,
  vscodeAnalytics: vscodeAnalyticsSchema
})

export const projectSettingSchema = z.object({
  attentionMode: projectAttentionModeSchema,
  category: projectMetricSchema.shape.category,
  enabled: z.boolean(),
  hasWebsite: z.boolean(),
  name: z.string().trim(),
  pinned: z.boolean(),
  relevanceScore: projectMetricSchema.shape.relevanceScore,
  slug: z.string().trim(),
  status: projectMetricSchema.shape.status,
  websiteAnalyticsEnabled: z.boolean()
})

export const projectSettingsSchema = z.object({
  projects: z.array(projectSettingSchema),
  sync: syncStateSchema
})

export const updateProjectSettingSchema = z
  .object({
    attentionMode: projectAttentionModeSchema.optional(),
    enabled: z.boolean().optional(),
    pinned: z.boolean().optional(),
    slug: z.string().trim().min(1),
    websiteAnalyticsEnabled: z.boolean().optional()
  })
  .refine(
    ({ attentionMode, enabled, pinned, websiteAnalyticsEnabled }) => attentionMode !== undefined ||
      enabled !== undefined ||
      pinned !== undefined ||
      websiteAnalyticsEnabled !== undefined,
    { error: 'At least one project setting is required.' }
  )

export const recoveryLoginSchema = z.object({
  passcode: z.string().trim().min(8).max(128)
})

export const websiteAnalyticsPointSchema = z.object({
  pageViews: z.int().nonnegative(),
  periodStart: z.string().trim(),
  sampleInterval: z.number().positive(),
  visits: z.int().nonnegative()
})

export const websiteAnalyticsSiteSchema = z.object({
  history: z.array(websiteAnalyticsPointSchema),
  hostname: z.string().trim(),
  pageViews: z.int().nonnegative(),
  slug: z.string().trim(),
  visits: z.int().nonnegative()
})

export const websiteAnalyticsSchema = z.object({
  generatedAt: z.string().trim(),
  range: analyticsRangeSchema,
  sites: z.array(websiteAnalyticsSiteSchema)
})

export const storeProviderSchema = z.enum(['apple', 'google'])
export const storeMetricDimensionSchema = z.enum([
  'appVersion',
  'country',
  'device',
  'osVersion',
  'overall'
])

export const storeMetricNameSchema = z.enum([
  'activeDevices',
  'anrs',
  'crashes',
  'currentDeviceInstalls',
  'currentUserInstalls',
  'dailyDeviceInstalls',
  'dailyDeviceUninstalls',
  'dailyDeviceUpgrades',
  'dailyUserInstalls',
  'dailyUserUninstalls',
  'deletions',
  'firstTimeDownloads',
  'installations',
  'redownloads',
  'sessions',
  'totalDownloads',
  'totalUserInstalls'
])

export const storeMetricTotalsSchema = z.partialRecord(
  storeMetricNameSchema,
  z.number().nonnegative()
)

export const storeHistoryPointSchema = z.object({
  metrics: storeMetricTotalsSchema,
  periodStart: z.string().trim()
})

export const storeBreakdownValueSchema = z.object({
  label: z.string().trim(),
  metrics: storeMetricTotalsSchema
})

export const storeBreakdownSchema = z.object({
  dimension: storeMetricDimensionSchema.exclude(['overall']),
  values: z.array(storeBreakdownValueSchema)
})

export const storeProviderAnalyticsSchema = z.object({
  breakdowns: z.array(storeBreakdownSchema),
  history: z.array(storeHistoryPointSchema),
  lastCollectedAt: z.string().trim().nullable(),
  lastSyncAt: z.string().trim().nullable(),
  listingUrl: z.url(),
  metrics: storeMetricTotalsSchema,
  provider: storeProviderSchema,
  status: z.enum(['available', 'awaiting_data', 'failed', 'not_configured'])
})

export const publishedAppAnalyticsSchema = z.object({
  displayName: z.string().trim(),
  providers: z.array(storeProviderAnalyticsSchema),
  slug: z.string().trim()
})

export const storeAnalyticsSchema = z.object({
  apps: z.array(publishedAppAnalyticsSchema),
  generatedAt: z.string().trim(),
  range: analyticsRangeSchema
})

export const projectDashboardSchema = z.object({
  generatedAt: z.string().trim(),
  growth: projectGrowthSchema,
  history: z.array(historyPointSchema),
  npmAnalytics: npmAnalyticsSchema,
  openVsxAnalytics: openVsxAnalyticsSchema,
  operationalHealth: operationalHealthSchema,
  period: periodSummarySchema,
  project: projectMetricSchema,
  range: analyticsRangeSchema,
  releaseAnalytics: releaseAnalyticsSchema,
  sync: syncStateSchema,
  vscodeAnalytics: vscodeAnalyticsSchema,
  websiteAnalytics: websiteAnalyticsSiteSchema.nullable()
})

export type Dashboard = z.infer<typeof dashboardSchema>
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>
export type ProjectDashboard = z.infer<typeof projectDashboardSchema>
export type OperationalHealth = z.infer<typeof operationalHealthSchema>
export type ReleaseAnalytics = z.infer<typeof releaseAnalyticsSchema>
export type ProjectGrowth = z.infer<typeof projectGrowthSchema>
export type ProjectGrowthSignal = z.infer<typeof projectGrowthSignalSchema>
export type ProjectMetric = z.infer<typeof projectMetricSchema>
export type ProjectSettings = z.infer<typeof projectSettingsSchema>
export type UpdateProjectSettingInput = z.infer<
  typeof updateProjectSettingSchema
>
export type WebsiteAnalytics = z.infer<typeof websiteAnalyticsSchema>
export type WebsiteAnalyticsPoint = z.infer<typeof websiteAnalyticsPointSchema>
export type WebsiteAnalyticsSite = z.infer<typeof websiteAnalyticsSiteSchema>
export type StoreAnalytics = z.infer<typeof storeAnalyticsSchema>
export type StoreProviderAnalytics = z.infer<
  typeof storeProviderAnalyticsSchema
>
export type StoreMetricName = z.infer<typeof storeMetricNameSchema>
export type StoreMetricTotals = z.infer<typeof storeMetricTotalsSchema>
export type StoreProvider = z.infer<typeof storeProviderSchema>
export interface ApiError {
  error: {
    code: string
    message: string
  }
}
