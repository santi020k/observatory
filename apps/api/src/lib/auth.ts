import {
  cleanupExpiredAuth,
  countRecentFailedAuthAttempts,
  createDb,
  deleteSession,
  findSession,
  insertSession,
  recordAuthAttempt
} from '@santi020k/observatory-db'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type { WorkerEnv } from '../env'

import { resolveOwnerAuthSession } from './auth-cloudflare'
import { generateToken, hashValue, safeEqual } from './crypto'

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const MAX_RECOVERY_ATTEMPTS = 5
const RECOVERY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

const getSessionCookieName = (environment: string): string => environment === 'production' ?
  '__Secure-observatory_session' :
  'observatory_session'

const getSessionCookieDomain = (
  environment: WorkerEnv['Bindings']
): string | undefined => environment.ENVIRONMENT === 'production' ?
  new URL(environment.SITE_URL).hostname :
  undefined

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const getClientIdentity = (context: Context<WorkerEnv>): string => {
  const cloudflareIp = context.req.header('CF-Connecting-IP')

  if (cloudflareIp) return cloudflareIp

  return context.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'local'
}

const createRecoverySession = async (
  context: Context<WorkerEnv>
): Promise<void> => {
  const database = createDb(context.env.DB)
  const now = Date.now()
  const token = generateToken()
  const tokenHash = await hashValue(context.env.AUTH_SECRET, token)
  const cookieDomain = getSessionCookieDomain(context.env)

  await insertSession(database, {
    createdAt: now,
    email: normalizeEmail(context.env.OWNER_EMAIL),
    expiresAt: now + SESSION_LIFETIME_MS,
    id: crypto.randomUUID(),
    lastSeenAt: now,
    tokenHash
  })

  setCookie(context, getSessionCookieName(context.env.ENVIRONMENT), token, {
    ...(cookieDomain ? { domain: cookieDomain } : {}),
    httpOnly: true,
    maxAge: SESSION_LIFETIME_MS / 1000,
    path: '/',
    sameSite: 'Lax',
    secure: context.env.ENVIRONMENT === 'production'
  })
}

export const verifyRecoveryPasscode = async (
  context: Context<WorkerEnv>,
  passcode: string
): Promise<'invalid' | 'limited' | 'valid'> => {
  const database = createDb(context.env.DB)
  const now = Date.now()

  const identity = await hashValue(
    context.env.AUTH_SECRET, `recovery-attempt:${getClientIdentity(context)}`
  )

  const recentFailures = await countRecentFailedAuthAttempts(
    database, identity, now - RECOVERY_ATTEMPT_WINDOW_MS
  )

  if (recentFailures >= MAX_RECOVERY_ATTEMPTS) return 'limited'

  const [candidateHash, expectedHash] = await Promise.all([
    hashValue(context.env.AUTH_SECRET, passcode),
    hashValue(context.env.AUTH_SECRET, context.env.OWNER_PASSCODE)
  ])

  const valid = safeEqual(candidateHash, expectedHash)

  await recordAuthAttempt(database, {
    createdAt: now,
    id: crypto.randomUUID(),
    identity,
    succeeded: valid
  })

  if (!valid) return 'invalid'

  await createRecoverySession(context)

  return 'valid'
}

export const resolveSessionEmail = async (
  context: Context<WorkerEnv>
): Promise<string | null> => {
  const token = getCookie(
    context, getSessionCookieName(context.env.ENVIRONMENT)
  )

  if (!token) return null

  const database = createDb(context.env.DB)
  const tokenHash = await hashValue(context.env.AUTH_SECRET, token)
  const session = await findSession(database, tokenHash, Date.now())

  return session?.email ?? null
}

export const resolveAuthenticatedEmail = async (
  context: Context<WorkerEnv>
): Promise<string | null> => await resolveOwnerAuthSession(context) ??
  await resolveSessionEmail(context)

export const requireAuth: MiddlewareHandler<WorkerEnv> = async (
  context,
  next
) => {
  const email = await resolveAuthenticatedEmail(context)

  if (!email) {
    return context.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, 401
    )
  }

  context.set('sessionEmail', email)

  await next()
}

export const logoutRecoverySession = async (
  context: Context<WorkerEnv>
): Promise<void> => {
  const cookieName = getSessionCookieName(context.env.ENVIRONMENT)
  const cookieDomain = getSessionCookieDomain(context.env)
  const token = getCookie(context, cookieName)

  if (token) {
    const database = createDb(context.env.DB)
    const tokenHash = await hashValue(context.env.AUTH_SECRET, token)

    await deleteSession(database, tokenHash)
  }

  deleteCookie(context, cookieName, {
    ...(cookieDomain ? { domain: cookieDomain } : {}),
    path: '/',
    secure: context.env.ENVIRONMENT === 'production'
  })
}

export const cleanupAuth = async (
  env: WorkerEnv['Bindings']
): Promise<void> => {
  await cleanupExpiredAuth(createDb(env.DB), Date.now())
}
