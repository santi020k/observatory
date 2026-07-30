import * as z from 'zod'

export const requestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email())
})

export const verifyCodeSchema = requestCodeSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
})

export const projectSourceSchema = z.object({
  github: z.string().trim(),
  npm: z.array(z.string().trim()).default([]),
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

export const analyticsRangeSchema = z.enum(['5d', '30d', '90d', '1y', '5y'])

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

export const dashboardSchema = z.object({
  generatedAt: z.string().trim(),
  history: z.array(historyPointSchema),
  period: periodSummarySchema,
  projects: z.array(projectMetricSchema),
  range: analyticsRangeSchema,
  summary: z.object({
    activeProjects: z.int().nonnegative(),
    githubClones14d: z.int().nonnegative().nullable(),
    githubViews14d: z.int().nonnegative().nullable(),
    npmDownloads30d: z.int().nonnegative(),
    openIssues: z.int().nonnegative(),
    publicProjects: z.int().nonnegative()
  }),
  sync: z.object({
    completedAt: z.string().trim().nullable(),
    status: z.enum(['failed', 'idle', 'running', 'succeeded'])
  })
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
  projects: z.array(projectSettingSchema)
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
      websiteAnalyticsEnabled !== undefined, { error: 'At least one project setting is required.' }
  )

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

export const projectDashboardSchema = z.object({
  generatedAt: z.string().trim(),
  history: z.array(historyPointSchema),
  period: periodSummarySchema,
  project: projectMetricSchema,
  range: analyticsRangeSchema,
  websiteAnalytics: websiteAnalyticsSiteSchema.nullable()
})

export type Dashboard = z.infer<typeof dashboardSchema>
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>
export type ProjectDashboard = z.infer<typeof projectDashboardSchema>
export type ProjectMetric = z.infer<typeof projectMetricSchema>
export type ProjectSettings = z.infer<typeof projectSettingsSchema>
export type UpdateProjectSettingInput = z.infer<
  typeof updateProjectSettingSchema
>
export type WebsiteAnalytics = z.infer<typeof websiteAnalyticsSchema>
export type WebsiteAnalyticsPoint = z.infer<typeof websiteAnalyticsPointSchema>
export type WebsiteAnalyticsSite = z.infer<typeof websiteAnalyticsSiteSchema>
export type RequestCodeInput = z.infer<typeof requestCodeSchema>
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export interface RequestCodeResponse {
  developmentCode?: string
  message: string
}

export interface SessionResponse {
  authenticated: boolean
  email?: string
}
