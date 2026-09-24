import {
  cleanupExpiredAuth,
  consumeAuthCode,
  countRecentAuthCodes,
  countRecentFailedAuthAttempts,
  createDb,
  deleteSession,
  findLatestUsableCode,
  findSession,
  insertAuthCode,
  insertSession,
  recordAuthAttempt,
  recordCodeAttempt,
  tryInsertAuthCodeRequest
} from '@santi020k/observatory-db'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import type { WorkerEnv } from '../env'

import { generateCode, generateToken, hashValue, safeEqual } from './crypto'
import { sendLoginCode } from './email'

const CODE_LIFETIME_MS = 10 * 60 * 1000
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const REQUEST_WINDOW_MS = 10 * 60 * 1000
const MAX_CODES_PER_WINDOW = 3
const MAX_CODE_REQUESTS_PER_IDENTITY = 8
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

export const requestLoginCode = async (
  context: Context<WorkerEnv>,
  email: string
): Promise<{ developmentCode?: string, message: string }> => {
  const normalizedEmail = normalizeEmail(email)
  const ownerEmail = normalizeEmail(context.env.OWNER_EMAIL)

  const message =
    'If this address is authorized, a verification code is on its way.'

  const database = createDb(context.env.DB)
  const now = Date.now()

  const identityHash = await hashValue(
    context.env.AUTH_SECRET, `auth-code-request:${getClientIdentity(context)}`
  )

  const requestAccepted = await tryInsertAuthCodeRequest(database, {
    createdAt: now,
    expiresAt: now + REQUEST_WINDOW_MS,
    id: crypto.randomUUID(),
    identityHash
  }, now - REQUEST_WINDOW_MS, MAX_CODE_REQUESTS_PER_IDENTITY)

  if (!requestAccepted) return { message }

  const recentCount = await countRecentAuthCodes(
    database, normalizedEmail, now - REQUEST_WINDOW_MS
  )

  const code = generateCode()

  const codeHash = await hashValue(
    context.env.AUTH_SECRET, `${normalizedEmail}:${code}`
  )

  const authorized =
    normalizedEmail === ownerEmail && recentCount < MAX_CODES_PER_WINDOW

  const storeAndSendCode = async () => {
    await insertAuthCode(database, {
      codeHash,
      createdAt: now,
      email: normalizedEmail,
      expiresAt: now + CODE_LIFETIME_MS,
      id: crypto.randomUUID()
    })

    return sendLoginCode(context.env, normalizedEmail, code)
  }

  if (context.env.ENVIRONMENT === 'development') {
    if (!authorized) return { message }

    const result = await storeAndSendCode()

    return { ...result, message }
  }

  context.executionCtx.waitUntil(
    authorized ? storeAndSendCode() : Promise.resolve()
  )

  return { message }
}

export const createOwnerSession = async (
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

export const verifyLoginCode = async (
  context: Context<WorkerEnv>,
  email: string,
  code: string
): Promise<boolean> => {
  const normalizedEmail = normalizeEmail(email)
  const database = createDb(context.env.DB)
  const now = Date.now()
  const record = await findLatestUsableCode(database, normalizedEmail, now)

  const candidateHash = await hashValue(
    context.env.AUTH_SECRET, `${normalizedEmail}:${code}`
  )

  if (!record) {
    await recordCodeAttempt(database, crypto.randomUUID())

    return false
  }

  const valid =
    normalizedEmail === normalizeEmail(context.env.OWNER_EMAIL) &&
    safeEqual(record.codeHash, candidateHash)

  if (!valid) {
    await recordCodeAttempt(database, record.id)

    return false
  }

  if (!(await consumeAuthCode(database, record.id, now))) return false

  await createOwnerSession(context)

  return true
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

  await createOwnerSession(context)

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

export const requireAuth: MiddlewareHandler<WorkerEnv> = async (
  context,
  next
) => {
  const email = await resolveSessionEmail(context)

  if (!email) {
    return context.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, 401
    )
  }

  context.set('sessionEmail', email)

  await next()
}

export const logout = async (context: Context<WorkerEnv>): Promise<void> => {
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
    path: '/'
  })
}

export const cleanupAuth = async (
  env: WorkerEnv['Bindings']
): Promise<void> => {
  await cleanupExpiredAuth(createDb(env.DB), Date.now())
}
