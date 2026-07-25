import {
  analyticsRangeSchema,
  updateProjectSettingSchema,
} from '@santi020k/observatory-api-types'
import { createDb, setProjectPreference } from '@santi020k/observatory-db'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import { cleanupAuth, requireAuth } from './lib/auth'
import {
  buildWebsiteAnalytics,
  syncCloudflareAnalytics,
} from './lib/cloudflare'
import { syncProjects } from './lib/collector'
import {
  buildDashboard,
  buildProjectDashboard,
  buildProjectSettings,
} from './lib/dashboard'
import { authRoutes } from './routes/auth'
import type { Bindings, WorkerEnv } from './env'

export const app = new Hono<WorkerEnv>()

app.use(logger())

app.use(secureHeaders())

app.use('*', async (context, next) => {
  const method = context.req.method
  const origin = context.req.header('Origin')

  const allowedOrigins = context.env.CORS_ORIGIN.split(',').map((value) =>
    value.trim(),
  )

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    origin &&
    !allowedOrigins.includes(origin)
  ) {
    return context.json(
      {
        error: {
          code: 'INVALID_ORIGIN',
          message: 'Request origin is not allowed.',
        },
      },
      403,
    )
  }

  await next()
})

app.use('*', async (context, next) =>
  cors({
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    origin: context.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  })(context, next),
)

app.get('/health', (context) =>
  context.json({
    service: 'observatory-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }),
)

app.route('/auth', authRoutes)

const readRange = (value: string | undefined) =>
  analyticsRangeSchema.catch('30d').parse(value)

app.get('/dashboard', requireAuth, async (context) =>
  context.json(
    await buildDashboard(context.env, readRange(context.req.query('range'))),
  ),
)

app.get('/projects/:slug', requireAuth, async (context) => {
  const dashboard = await buildProjectDashboard(
    context.env,
    context.req.param('slug'),
    readRange(context.req.query('range')),
  )

  return dashboard
    ? context.json(dashboard)
    : context.json(
        {
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: 'Project not found or disabled.',
          },
        },
        404,
      )
})

app.get('/settings/projects', requireAuth, async (context) =>
  context.json(await buildProjectSettings(context.env)),
)

app.post('/settings/projects', requireAuth, async (context) => {
  const input = updateProjectSettingSchema.safeParse(await context.req.json())

  if (!input.success)
    return context.json(
      {
        error: {
          code: 'INVALID_PROJECT_SETTING',
          message: 'A project slug and enabled state are required.',
        },
      },
      400,
    )

  await setProjectPreference(
    createDb(context.env.DB),
    input.data.slug,
    input.data.enabled,
    Date.now(),
  )

  return context.json({ updated: true })
})

app.post('/sync', requireAuth, async (context) => {
  const count = await syncProjects(context.env)

  return context.json({ count, status: 'succeeded' })
})

app.get('/analytics/websites', requireAuth, async (context) =>
  context.json(
    await buildWebsiteAnalytics(
      context.env,
      readRange(context.req.query('range')),
    ),
  ),
)

app.post('/sync/cloudflare', requireAuth, async (context) => {
  const count = await syncCloudflareAnalytics(context.env)

  return context.json({ count, status: 'succeeded' })
})

app.notFound((context) =>
  context.json(
    { error: { code: 'NOT_FOUND', message: 'Route not found.' } },
    404,
  ),
)

app.onError((error, context) => {
  console.error(error)

  return context.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
      },
    },
    500,
  )
})

export default {
  fetch: (
    request: Request,
    env: Bindings,
    executionContext: ExecutionContext,
  ) => app.fetch(request, env, executionContext),
  scheduled: (
    _controller: ScheduledController,
    env: Bindings,
    executionContext: ExecutionContext,
  ) => {
    executionContext.waitUntil(
      (async () => {
        await Promise.all([
          syncProjects(env),
          syncCloudflareAnalytics(env),
          cleanupAuth(env),
        ])
      })(),
    )
  },
}
