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
  history: z.array(historyPointSchema),
  npmAnalytics: npmAnalyticsSchema,
  openVsxAnalytics: openVsxAnalyticsSchema,
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
      websiteAnalyticsEnabled !== undefined, { error: 'At least one project setting is required.' }
  )

const base64UrlSchema = z.string().trim().min(1).regex(/^[A-Za-z0-9_-]+$/)

const authenticatorTransportSchema = z.enum([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb'
])

const clientExtensionResultsSchema = z.record(z.string(), z.unknown())

export const recoveryLoginSchema = z.object({
  passcode: z.string().trim().min(8).max(128)
})

export const passkeyRegistrationResponseSchema = z.object({
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: clientExtensionResultsSchema,
  id: base64UrlSchema,
  rawId: base64UrlSchema,
  response: z.object({
    attestationObject: base64UrlSchema,
    authenticatorData: base64UrlSchema.optional(),
    clientDataJSON: base64UrlSchema,
    publicKey: base64UrlSchema.optional(),
    publicKeyAlgorithm: z.int().optional(),
    transports: z.array(authenticatorTransportSchema).optional()
  }),
  type: z.literal('public-key')
})

export const passkeyAuthenticationResponseSchema = z.object({
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: clientExtensionResultsSchema,
  id: base64UrlSchema,
  rawId: base64UrlSchema,
  response: z.object({
    authenticatorData: base64UrlSchema,
    clientDataJSON: base64UrlSchema,
    signature: base64UrlSchema,
    userHandle: base64UrlSchema.optional()
  }),
  type: z.literal('public-key')
})

export const verifyPasskeyRegistrationSchema = z.object({
  challengeId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  response: passkeyRegistrationResponseSchema
})

export const verifyPasskeyAuthenticationSchema = z.object({
  challengeId: z.string().trim().min(1),
  response: passkeyAuthenticationResponseSchema
})

export const passkeyCredentialSchema = z.object({
  backedUp: z.boolean(),
  createdAt: z.int().nonnegative(),
  deviceType: z.enum(['singleDevice', 'multiDevice']),
  id: z.string().trim(),
  lastUsedAt: z.int().nonnegative().nullable(),
  name: z.string().trim()
})

export const passkeyCredentialsSchema = z.object({
  credentials: z.array(passkeyCredentialSchema)
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

export const projectDashboardSchema = z.object({
  generatedAt: z.string().trim(),
  history: z.array(historyPointSchema),
  npmAnalytics: npmAnalyticsSchema,
  openVsxAnalytics: openVsxAnalyticsSchema,
  period: periodSummarySchema,
  project: projectMetricSchema,
  range: analyticsRangeSchema,
  sync: syncStateSchema,
  vscodeAnalytics: vscodeAnalyticsSchema,
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
export type PasskeyCredential = z.infer<typeof passkeyCredentialSchema>
export type VerifyPasskeyAuthenticationInput = z.infer<
  typeof verifyPasskeyAuthenticationSchema
>
export type VerifyPasskeyRegistrationInput = z.infer<
  typeof verifyPasskeyRegistrationSchema
>

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
