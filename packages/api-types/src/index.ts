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

export const dashboardSchema = z.object({
  generatedAt: z.string().trim(),
  projects: z.array(projectMetricSchema),
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

export type Dashboard = z.infer<typeof dashboardSchema>
export type ProjectMetric = z.infer<typeof projectMetricSchema>
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
