import {
  createOwnerAuth,
  type OwnerAuthInstance
} from '@santi020k/auth-cloudflare'
import type { Context } from 'hono'

import type { WorkerEnv } from '../env'

import { sendLoginCode } from './email'

const COOKIE_PREFIX = 'observatory-owner'

const resolveAuthServerURL = (context: Context<WorkerEnv>): string => {
  const requestUrl = new URL(context.req.url)

  if (context.env.ENVIRONMENT === 'production') {
    requestUrl.protocol = 'https:'

    return requestUrl.origin
  }

  const applicationUrl = new URL(context.env.SITE_URL)

  return `http://${applicationUrl.hostname}:8787`
}

export const createObservatoryOwnerAuth = (
  context: Context<WorkerEnv>
): OwnerAuthInstance => createOwnerAuth({
  appName: 'Observatory',
  applicationOrigin: new URL(context.env.SITE_URL).origin,
  authServerURL: resolveAuthServerURL(context),
  basePath: '/api/auth',
  cookiePrefix: COOKIE_PREFIX,
  database: context.env.DB,
  ownerEmail: context.env.OWNER_EMAIL,
  secret: context.env.AUTH_SECRET,
  sendVerificationOTP: async ({ email, otp }) => {
    const result = await sendLoginCode(context.env, email, otp)

    if (result.developmentCode)
      throw new Error('auth_package_local_email_delivery_unavailable')
  },
  waitUntil: task => {
    context.executionCtx.waitUntil(task)
  }
})

const handleObservatoryOwnerAuthRequest = (
  context: Context<WorkerEnv>,
  request: Request
): Promise<Response> => {
  const auth = createObservatoryOwnerAuth(context)
  const requestUrl = new URL(request.url)

  if (requestUrl.origin === auth.policy.authServerOrigin)
    return auth.handler(request)

  const normalizedUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    auth.policy.authServerOrigin
  )

  return auth.handler(new Request(normalizedUrl, request))
}

export const handleObservatoryOwnerAuth = (
  context: Context<WorkerEnv>
): Promise<Response> => handleObservatoryOwnerAuthRequest(
  context, context.req.raw
)

export const logoutObservatoryOwnerAuth = (
  context: Context<WorkerEnv>
): Promise<Response> => {
  const requestUrl = new URL('/api/auth/sign-out', context.req.url)
  const headers = new Headers(context.req.raw.headers)

  headers.set('Origin', new URL(context.env.SITE_URL).origin)

  return handleObservatoryOwnerAuthRequest(context, new Request(requestUrl, {
    headers,
    method: 'POST'
  }))
}

export const resolveOwnerAuthSession = async (
  context: Context<WorkerEnv>
): Promise<string | null> => {
  const session = await createObservatoryOwnerAuth(context).resolveSession(
    context.req.raw.headers
  )

  return session?.email ?? null
}
