import * as z from 'zod'

export const requestCodeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
})

export const verifyCodeSchema = requestCodeSchema.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export const projectSourceSchema = z.object({
  github: z.string().trim(),
  npm: z.array(z.string().trim()).default([]),
  website: z.url().nullable(),
})

export const projectMetricSchema = z.object({
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
  pushedAt: z.string().trim().nullable(),
  responseTimeMs: z.int().nonnegative().nullable(),
  slug: z.string().trim(),
  sources: projectSourceSchema,
  stars: z.int().nonnegative(),
  status: z.enum(['active', 'archived', 'maintained', 'paused']),
  topics: z.array(z.string().trim()),
  visibility: z.enum(['private', 'public']),
})

export const analyticsRangeSchema = z.enum(['30d', '1y', '5y'])

export const historyPointSchema = z.object({
  collectedAt: z.string().trim(),
  githubViews14d: z.int().nonnegative().nullable(),
  npmDownloads30d: z.int().nonnegative(),
  openIssues: z.int().nonnegative(),
  stars: z.int().nonnegative(),
})

export const periodSummarySchema = z.object({
  issueChange: z.int(),
  starsGained: z.int(),
  syncs: z.int().nonnegative(),
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
    publicProjects: z.int().nonnegative(),
  }),
  sync: z.object({
    completedAt: z.string().trim().nullable(),
    status: z.enum(['failed', 'idle', 'running', 'succeeded']),
  }),
})

export const projectDashboardSchema = z.object({
  generatedAt: z.string().trim(),
  history: z.array(historyPointSchema),
  period: periodSummarySchema,
  project: projectMetricSchema,
  range: analyticsRangeSchema,
})

export const projectSettingSchema = z.object({
  category: projectMetricSchema.shape.category,
  enabled: z.boolean(),
  name: z.string().trim(),
  slug: z.string().trim(),
  status: projectMetricSchema.shape.status,
})

export const projectSettingsSchema = z.object({
  projects: z.array(projectSettingSchema),
})

export const updateProjectSettingSchema = z.object({
  enabled: z.boolean(),
  slug: z.string().trim().min(1),
})

export type Dashboard = z.infer<typeof dashboardSchema>
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>
export type ProjectDashboard = z.infer<typeof projectDashboardSchema>
export type ProjectMetric = z.infer<typeof projectMetricSchema>
export type ProjectSettings = z.infer<typeof projectSettingsSchema>
export type UpdateProjectSettingInput = z.infer<
  typeof updateProjectSettingSchema
>
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
