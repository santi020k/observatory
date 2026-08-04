import {
  cleanupExpiredAuth,
  countRecentAuthCodes,
  countRecentFailedAuthAttempts,
  createDb,
  deleteSession,
  findLatestUsableCode,
  findSession,
  insertAuthCode,
  insertSession,
  recordAuthAttempt,
  recordCodeAttempt
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
const MAX_RECOVERY_ATTEMPTS = 5
const RECOVERY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

const getSessionCookieName = (environment: string): string => environment === 'production' ?
  '__Host-observatory_session' :
  'observatory_session'

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export const requestLoginCode = async (
  context: Context<WorkerEnv>,
  email: string
): Promise<{ developmentCode?: string, message: string }> => {
  const normalizedEmail = normalizeEmail(email)
  const ownerEmail = normalizeEmail(context.env.OWNER_EMAIL)

  const message =
    'If this address is authorized, a verification code is on its way.'

  if (normalizedEmail !== ownerEmail) return { message }

  const database = createDb(context.env.DB)
  const now = Date.now()

  const recentCount = await countRecentAuthCodes(
    database, normalizedEmail, now - REQUEST_WINDOW_MS
  )

  if (recentCount >= MAX_CODES_PER_WINDOW) return { message }

  const code = generateCode()

  const codeHash = await hashValue(
    context.env.AUTH_SECRET, `${normalizedEmail}:${code}`
  )

  await insertAuthCode(database, {
    codeHash,
    createdAt: now,
    email: normalizedEmail,
    expiresAt: now + CODE_LIFETIME_MS,
    id: crypto.randomUUID()
  })

  const result = await sendLoginCode(context.env, normalizedEmail, code)

  return { ...result, message }
}

export const createOwnerSession = async (
  context: Context<WorkerEnv>
): Promise<void> => {
  const database = createDb(context.env.DB)
  const now = Date.now()
  const token = generateToken()
  const tokenHash = await hashValue(context.env.AUTH_SECRET, token)

  await insertSession(database, {
    createdAt: now,
    email: normalizeEmail(context.env.OWNER_EMAIL),
    expiresAt: now + SESSION_LIFETIME_MS,
    id: crypto.randomUUID(),
    lastSeenAt: now,
    tokenHash
  })

  setCookie(context, getSessionCookieName(context.env.ENVIRONMENT), token, {
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

  if (normalizedEmail !== normalizeEmail(context.env.OWNER_EMAIL)) return false

  const database = createDb(context.env.DB)
  const now = Date.now()
  const record = await findLatestUsableCode(database, normalizedEmail, now)

  if (!record) return false

  const candidateHash = await hashValue(
    context.env.AUTH_SECRET, `${normalizedEmail}:${code}`
  )

  const valid = safeEqual(record.codeHash, candidateHash)

  await recordCodeAttempt(database, record.id, valid ? now : undefined)

  if (!valid) return false

  await createOwnerSession(context)

  return true
}

const getClientIdentity = (context: Context<WorkerEnv>): string => {
  const cloudflareIp = context.req.header('CF-Connecting-IP')

  if (cloudflareIp) return cloudflareIp

  return context.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'local'
}

export const verifyRecoveryPasscode = async (
  context: Context<WorkerEnv>,
  passcode: string
): Promise<'invalid' | 'limited' | 'valid'> => {
  const database = createDb(context.env.DB)
  const now = Date.now()
  const identity = getClientIdentity(context)

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
  const token = getCookie(context, cookieName)

  if (token) {
    const database = createDb(context.env.DB)
    const tokenHash = await hashValue(context.env.AUTH_SECRET, token)

    await deleteSession(database, tokenHash)
  }

  deleteCookie(context, cookieName, { path: '/' })
}

export const cleanupAuth = async (
  env: WorkerEnv['Bindings']
): Promise<void> => {
  await cleanupExpiredAuth(createDb(env.DB), Date.now())
}
