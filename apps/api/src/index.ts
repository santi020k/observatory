import {
  analyticsRangeSchema,
  updateProjectSettingSchema
} from '@santi020k/observatory-api-types'
import { getFeedbackProject } from '@santi020k/observatory-catalog'
import { createDb, setProjectPreference } from '@santi020k/observatory-db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import { cleanupAuth, requireAuth } from './lib/auth'
import { handleObservatoryOwnerAuth } from './lib/auth-cloudflare'
import {
  buildWebsiteAnalytics,
  syncCloudflareAnalytics
} from './lib/cloudflare'
import { syncProjects } from './lib/collector'
import {
  buildDashboard,
  buildProjectDashboard,
  buildProjectSettings
} from './lib/dashboard'
import {
  buildStoreAnalytics,
  syncStoreAnalytics
} from './lib/store-analytics'
import { authRoutes } from './routes/auth'
import { feedbackRoutes } from './routes/feedback'
import type { Bindings, WorkerEnv } from './env'

export const app = new Hono<WorkerEnv>()

app.use(logger())

app.use(secureHeaders())

app.all('/api/auth/*', handleObservatoryOwnerAuth)

const readCorsOrigin = (environment: unknown): string | null => {
  if (
    typeof environment !== 'object' ||
    environment === null ||
    !('CORS_ORIGIN' in environment) ||
    typeof environment.CORS_ORIGIN !== 'string'
  ) {
    return null
  }

  return environment.CORS_ORIGIN
}

const feedbackProjectPath = /^\/(?:api\/)?feedback\/projects\/([^/]+)/

const getFeedbackOriginsForPath = (path: string): readonly string[] => {
  const projectSlug = feedbackProjectPath.exec(path)?.[1]

  if (!projectSlug) return []

  return getFeedbackProject(projectSlug)?.allowedOrigins ?? []
}

const getAllowedOrigins = (
  environment: unknown,
  path: string
): string[] => [
  ...(readCorsOrigin(environment)
    ?.split(',')
    .map(origin => origin.trim()) ?? []),
  ...getFeedbackOriginsForPath(path)
]

app.use('*', async (context, next) => {
  const method = context.req.method
  const origin = context.req.header('Origin')
  const allowedOrigins = getAllowedOrigins(context.env, context.req.path)

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    origin &&
    !allowedOrigins.includes(origin)
  ) {
    return context.json(
      {
        error: {
          code: 'INVALID_ORIGIN',
          message: 'Request origin is not allowed.'
        }
      }, 403
    )
  }

  await next()
})

app.use('*', cors({
  allowHeaders: ['Content-Type', 'X-Feedback-Voter'],
  allowMethods: ['DELETE', 'GET', 'PATCH', 'POST', 'OPTIONS'],
  credentials: true,
  origin: (origin, context) => {
    const allowedOrigins = getAllowedOrigins(context.env, context.req.path)

    return allowedOrigins.includes(origin) ? origin : null
  }
}))

app.get('/health', context => context.json({
  service: 'observatory-api',
  status: 'ok',
  timestamp: new Date().toISOString()
}))

app.route('/auth', authRoutes)

app.route('/feedback', feedbackRoutes)

app.route('/api/feedback', feedbackRoutes)

const readRange = (value: string | undefined) => analyticsRangeSchema.catch('30d').parse(value)

export const runDashboardSync = async <Environment>(
  environment: Environment,
  synchronizeProjects: (environment: Environment) => Promise<number>,
  synchronizeWebsiteAnalytics: (
    environment: Environment
  ) => Promise<number>
) => {
  const count = await synchronizeProjects(environment)
  const websiteAnalyticsCount = await synchronizeWebsiteAnalytics(environment)

  return { count, websiteAnalyticsCount }
}

const syncDashboardData = (env: Bindings) => runDashboardSync(
  env, syncProjects, syncCloudflareAnalytics
)

app.get('/dashboard', requireAuth, async context => context.json(
  await buildDashboard(context.env, readRange(context.req.query('range')))
))

app.get('/projects/:slug', requireAuth, async context => {
  const dashboard = await buildProjectDashboard(
    context.env, context.req.param('slug'), readRange(context.req.query('range'))
  )

  return dashboard ?
    context.json(dashboard) :
    context.json(
      {
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found or disabled.'
        }
      }, 404
    )
})

app.get('/settings/projects', requireAuth, async context => context.json(await buildProjectSettings(context.env)))

app.post('/settings/projects', requireAuth, async context => {
  const input = updateProjectSettingSchema.safeParse(await context.req.json())

  if (!input.success)
    return context.json(
      {
        error: {
          code: 'INVALID_PROJECT_SETTING',
          message: 'A project slug and at least one setting are required.'
        }
      }, 400
    )

  const { attentionMode, enabled, pinned, slug, websiteAnalyticsEnabled } =
    input.data

  const settings = {
    ...(attentionMode === undefined ? {} : { attentionMode }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(pinned === undefined ? {} : { pinned }),
    ...(websiteAnalyticsEnabled === undefined ?
      {} :
      { websiteAnalyticsEnabled })
  }

  await setProjectPreference(
    createDb(context.env.DB), slug, settings, Date.now()
  )

  return context.json({ updated: true })
})

app.post('/sync', requireAuth, async context => {
  const { count, websiteAnalyticsCount } = await syncDashboardData(context.env)

  return context.json({ count, status: 'succeeded', websiteAnalyticsCount })
})

app.get('/analytics/websites', requireAuth, async context => context.json(
  await buildWebsiteAnalytics(
    context.env, readRange(context.req.query('range'))
  )
))

app.get('/analytics/apps', requireAuth, async context => context.json(
  await buildStoreAnalytics(
    context.env,
    readRange(context.req.query('range'))
  )
))

app.post('/sync/cloudflare', requireAuth, async context => {
  const count = await syncCloudflareAnalytics(context.env)

  return context.json({ count, status: 'succeeded' })
})

app.post('/sync/stores', requireAuth, async context => {
  const result = await syncStoreAnalytics(context.env)

  return context.json({
    ...result,
    status: result.failed > 0 ? 'failed' : 'succeeded'
  })
})

app.notFound(context => context.json(
  { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404
))

app.onError((error, context) => {
  reportError(error)

  return context.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.'
      }
    }, 500
  )
})

export default {
  fetch: (
    request: Request,
    env: Bindings,
    executionContext: ExecutionContext
  ) => app.fetch(request, env, executionContext),
  scheduled: (
    controller: ScheduledController,
    env: Bindings,
    executionContext: ExecutionContext
  ) => {
    executionContext.waitUntil(
      (async () => {
        try {
          if (controller.cron === '37 17 * * *') await syncStoreAnalytics(env)
          else await syncDashboardData(env)
        } finally {
          await cleanupAuth(env)
        }
      })()
    )
  }
}
