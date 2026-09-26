import {
  type AdminFeedbackItem,
  createFeedbackSchema,
  feedbackStatusSchema,
  type PublicFeedbackItem,
  updateFeedbackSchema } from '@santi020k/observatory-api-types'
import { getFeedbackProject, getFeedbackProjects } from '@santi020k/observatory-catalog'
import {
  consumeFeedbackRateLimit,
  createDb,
  createFeedbackItem,
  deleteFeedbackItem,
  listAdminFeedback,
  listPublicFeedback,
  pruneFeedbackRateLimits,
  toggleFeedbackVote,
  updateFeedbackItem
} from '@santi020k/observatory-db'
import type { Context } from 'hono'
import { Hono } from 'hono'
import * as z from 'zod'

import type { WorkerEnv } from '../env'
import { requireAuth } from '../lib/auth'
import { hashValue } from '../lib/crypto'
import { sendFeedbackNotification } from '../lib/email'

const feedbackRoutes = new Hono<WorkerEnv>()

const jsonError = (
  context: Context<WorkerEnv>,
  code: string,
  message: string,
  status: 400 | 403 | 404 | 429 | 503
) => context.json({ error: { code, message } }, status)

const toIso = (value: number): string => new Date(value).toISOString()

const toPublicItem = (
  row: Awaited<ReturnType<typeof listPublicFeedback>>[number]
): PublicFeedbackItem => ({
  ...row,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt)
})

const toAdminItem = (
  row: Awaited<ReturnType<typeof listAdminFeedback>>[number]
): AdminFeedbackItem => ({
  createdAt: toIso(row.createdAt),
  description: row.description,
  diagnosticReport: row.diagnosticReport,
  email: row.contactEmail,
  id: row.id,
  isPublic: row.isPublic,
  locale: row.locale,
  moderationStatus: row.moderationStatus,
  projectSlug: row.projectSlug,
  source: row.source,
  status: row.status,
  title: row.title,
  type: row.type,
  updatedAt: toIso(row.updatedAt),
  voteCount: row.voteCount
})

const requestOriginIsAllowed = (
  context: Context<WorkerEnv>,
  project: NonNullable<ReturnType<typeof getFeedbackProject>>
): boolean => {
  const origin = context.req.header('Origin')

  if (!origin) return true

  return project.allowedOrigins.includes(origin)
}

const getProject = (context: Context<WorkerEnv>) => getFeedbackProject(
  context.req.param('projectSlug') ?? ''
)

const getClientIdentity = (context: Context<WorkerEnv>): string => context.req.header(
  'CF-Connecting-IP'
) ?? context.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'local'

const getHashSecret = (environment: WorkerEnv['Bindings']): string => environment.FEEDBACK_HASH_SECRET ?? environment.AUTH_SECRET

const scheduleFeedbackNotification = (
  context: Context<WorkerEnv>,
  project: NonNullable<ReturnType<typeof getFeedbackProject>>,
  feedback: z.infer<typeof createFeedbackSchema>,
  id: string
): void => {
  context.executionCtx.waitUntil(
    sendFeedbackNotification(context.env, {
      contactEmail: feedback.email || null,
      description: feedback.description,
      diagnosticReport: feedback.diagnosticReport ?? null,
      id,
      locale: feedback.locale,
      projectDisplayName: project.displayName,
      projectSlug: project.slug,
      source: feedback.source,
      title: feedback.title,
      type: feedback.type
    })
  )
}

const verifyTurnstile = async (
  secret: string | undefined,
  token: string | undefined,
  remoteIp: string,
  environment: WorkerEnv['Bindings']['ENVIRONMENT']
): Promise<boolean> => {
  if (environment !== 'production' && (!secret || token === 'local-always-pass'))
    return true

  if (!secret || !token) return false

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: new URLSearchParams({ remoteip: remoteIp, response: token, secret }),
      method: 'POST'
    }
  )

  const result = z.object({ success: z.boolean() }).safeParse(
    await response.json().catch(() => null)
  )

  return result.success && result.data.success
}

feedbackRoutes.get('/projects', context => context.json({
  data: {
    projects: getFeedbackProjects().map(project => ({
      displayName: project.displayName,
      locales: [...project.locales],
      slug: project.slug,
      turnstileEnabled: context.env.ENVIRONMENT === 'production',
      turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? null
    }))
  }
}))

feedbackRoutes.get('/projects/:projectSlug/config', context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  return context.json({
    data: {
      project: {
        displayName: project.displayName,
        locales: [...project.locales],
        slug: project.slug,
        turnstileEnabled: context.env.ENVIRONMENT === 'production',
        turnstileSiteKey: context.env.TURNSTILE_SITE_KEY ?? null
      }
    }
  })
})

feedbackRoutes.get('/projects/:projectSlug/items', async context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  const requestedStatus = feedbackStatusSchema.safeParse(context.req.query('status'))
  const voterToken = context.req.header('X-Feedback-Voter')?.trim()

  const voterHash = voterToken ?
    await hashValue(getHashSecret(context.env), voterToken) :
    undefined

  const items = await listPublicFeedback(
    createDb(context.env.DB), project.slug, {
      sort: context.req.query('sort') === 'new' ? 'new' : 'top',
      ...(requestedStatus.success ? { status: requestedStatus.data } : {}),
      ...(voterHash ? { voterHash } : {})
    }
  )

  return context.json({ data: { items: items.map(toPublicItem) } })
})

feedbackRoutes.post('/projects/:projectSlug/items', async context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  if (!requestOriginIsAllowed(context, project))
    return jsonError(context, 'INVALID_ORIGIN', 'Request origin is not allowed for this project.', 403)

  const input = createFeedbackSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success)
    return jsonError(context, 'INVALID_FEEDBACK', 'The feedback submission is invalid.', 400)

  if (!project.locales.includes(input.data.locale))
    return jsonError(context, 'INVALID_LOCALE', 'The selected language is not supported.', 400)

  const identity = getClientIdentity(context)
  const hashSecret = getHashSecret(context.env)
  const keyHash = await hashValue(hashSecret, identity)
  const database = createDb(context.env.DB)

  const allowed = await consumeFeedbackRateLimit(database, {
    action: `${project.slug}:submit`,
    keyHash,
    limit: 5,
    windowStart: new Date().toISOString().slice(0, 10)
  })

  if (!allowed)
    return jsonError(context, 'SUBMISSION_RATE_LIMITED', 'The daily submission limit has been reached.', 429)

  if (
    input.data.source === 'website' &&
    !(await verifyTurnstile(
      context.env.TURNSTILE_SECRET_KEY, input.data.turnstileToken, identity, context.env.ENVIRONMENT
    ))
  )
    return jsonError(context, 'CAPTCHA_FAILED', 'Spam protection could not verify the submission.', 403)

  const now = Date.now()
  const id = crypto.randomUUID()

  await createFeedbackItem(database, {
    contactEmail: input.data.email || null,
    createdAt: now,
    description: input.data.description,
    diagnosticReport: input.data.diagnosticReport ?? null,
    id,
    locale: input.data.locale,
    projectSlug: project.slug,
    source: input.data.source,
    title: input.data.title,
    type: input.data.type,
    updatedAt: now
  })

  scheduleFeedbackNotification(context, project, input.data, id)

  context.executionCtx.waitUntil(
    pruneFeedbackRateLimits(
      database, new Date(now - 2 * 86_400_000).toISOString().slice(0, 10)
    )
  )

  return context.json({
    data: {
      item: {
        id,
        isPrivate: input.data.type !== 'idea',
        moderationStatus: 'pending'
      }
    }
  }, 201)
})

feedbackRoutes.post('/projects/:projectSlug/items/:itemId/vote', async context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  if (!requestOriginIsAllowed(context, project))
    return jsonError(context, 'INVALID_ORIGIN', 'Request origin is not allowed for this project.', 403)

  const voterToken = context.req.header('X-Feedback-Voter')?.trim()

  if (!voterToken || voterToken.length < 16 || voterToken.length > 200)
    return jsonError(context, 'INVALID_VOTER', 'A stable voter identifier is required.', 400)

  const result = await toggleFeedbackVote(
    createDb(context.env.DB), project.slug, context.req.param('itemId'), await hashValue(getHashSecret(context.env), voterToken), Date.now()
  )

  return result ?
    context.json({ data: result }) :
    jsonError(context, 'FEEDBACK_NOT_FOUND', 'The public idea was not found.', 404)
})

feedbackRoutes.use('/admin/*', requireAuth)

feedbackRoutes.get('/admin/items', async context => {
  const items = await listAdminFeedback(createDb(context.env.DB))

  return context.json({ data: { items: items.map(toAdminItem) } })
})

feedbackRoutes.get('/admin/projects/:projectSlug/items', async context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  const items = await listAdminFeedback(createDb(context.env.DB), project.slug)

  return context.json({
    data: {
      items: items.map(toAdminItem),
      project: { displayName: project.displayName, slug: project.slug }
    }
  })
})

feedbackRoutes.patch('/admin/projects/:projectSlug/items/:itemId', async context => {
  const project = getProject(context)

  const input = updateFeedbackSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  if (!input.success)
    return jsonError(context, 'INVALID_FEEDBACK_UPDATE', 'The feedback update is invalid.', 400)

  const item = await updateFeedbackItem(
    createDb(context.env.DB), project.slug, context.req.param('itemId'), {
      ...(input.data.isPublic === undefined ?
        {} :
        {
          isPublic: input.data.isPublic
        }),
      ...(input.data.moderationStatus === undefined ?
        {} :
        {
          moderationStatus: input.data.moderationStatus
        }),
      ...(input.data.status === undefined ?
        {} :
        {
          status: input.data.status
        })
    }, Date.now()
  )

  return item ?
    context.json({ data: { item: toAdminItem(item) } }) :
    jsonError(context, 'FEEDBACK_NOT_FOUND', 'The feedback item was not found.', 404)
})

feedbackRoutes.delete('/admin/projects/:projectSlug/items/:itemId', async context => {
  const project = getProject(context)

  if (!project)
    return jsonError(context, 'PROJECT_NOT_FOUND', 'Feedback is not configured for this project.', 404)

  const deleted = await deleteFeedbackItem(
    createDb(context.env.DB), project.slug, context.req.param('itemId')
  )

  return deleted ?
    context.json({ data: { deleted: true } }) :
    jsonError(context, 'FEEDBACK_NOT_FOUND', 'The feedback item was not found.', 404)
})

export { feedbackRoutes }
