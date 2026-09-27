import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { WorkerEnv } from './env'

const mocks = vi.hoisted(() => {
  const packageSession = { active: false }

  return {
    consumeAuthCode: vi.fn(),
    countRecentFailedAuthAttempts: vi.fn(),
    countRecentAuthCodes: vi.fn(),
    createOwnerAuth: vi.fn((_options: unknown) => ({
      handler: vi.fn((request: Request) => {
        if (new URL(request.url).pathname.endsWith('/sign-out')) {
          if (request.headers.get('Origin') !== 'https://observatory.example')
            return Response.json({ code: 'request_origin_not_allowed' }, { status: 403 })

          packageSession.active = false

          return Response.json({ success: true }, {
            headers: {
              'Set-Cookie': '__Secure-observatory-owner.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'
            }
          })
        }

        return Response.json({ authenticated: false })
      }),
      policy: { authServerOrigin: 'https://localhost' },
      resolveSession: vi.fn((_headers: Headers) => Promise.resolve(
        packageSession.active ?
          { email: 'owner@example.com', userId: 'owner-user-id' } :
          null
      ))
    })),
    createDb: vi.fn(() => ({ database: 'test' })),
    deleteSession: vi.fn(),
    findLatestUsableCode: vi.fn(),
    insertAuthCode: vi.fn(),
    insertSession: vi.fn(),
    packageSession,
    recordAuthAttempt: vi.fn(),
    recordCodeAttempt: vi.fn(),
    reportError: vi.fn(),
    sendLoginCode: vi.fn(),
    tryInsertAuthCodeRequest: vi.fn()
  }
})

vi.mock('@santi020k/observatory-db', async importOriginal => ({
  ...(await importOriginal()),
  consumeAuthCode: mocks.consumeAuthCode,
  countRecentFailedAuthAttempts: mocks.countRecentFailedAuthAttempts,
  countRecentAuthCodes: mocks.countRecentAuthCodes,
  createDb: mocks.createDb,
  deleteSession: mocks.deleteSession,
  findLatestUsableCode: mocks.findLatestUsableCode,
  insertAuthCode: mocks.insertAuthCode,
  insertSession: mocks.insertSession,
  recordAuthAttempt: mocks.recordAuthAttempt,
  recordCodeAttempt: mocks.recordCodeAttempt,
  tryInsertAuthCodeRequest: mocks.tryInsertAuthCodeRequest
}))

vi.mock('@santi020k/auth-cloudflare', () => ({
  createOwnerAuth: mocks.createOwnerAuth
}))

vi.mock('./lib/email', () => ({
  sendLoginCode: mocks.sendLoginCode
}))

const { app } = await import('./index')
const { requireAuth } = await import('./lib/auth')

const environment = {
  AUTH_SECRET: 'test-auth-secret-that-is-long-enough',
  OWNER_PASSCODE: 'private-test-code',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {},
  ENVIRONMENT: 'production',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  SITE_URL: 'https://observatory.example'
}

const executionContext = {
  passThroughOnException: vi.fn(),
  props: {},
  waitUntil: vi.fn()
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const readRequiredString = (
  value: unknown,
  key: string,
  errorMessage: string
): string => {
  if (!isRecord(value) || !(key in value))
    throw new TypeError(errorMessage)

  const field = value[key]

  if (typeof field !== 'string') throw new TypeError(errorMessage)

  return field
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('reportError', mocks.reportError)

  mocks.packageSession.active = false

  mocks.consumeAuthCode.mockResolvedValue(true)
  mocks.countRecentAuthCodes.mockResolvedValue(0)
  mocks.countRecentFailedAuthAttempts.mockResolvedValue(0)

  mocks.sendLoginCode.mockResolvedValue({})
  mocks.tryInsertAuthCodeRequest.mockResolvedValue(true)
})

describe('owner authentication flow', () => {
  test('configures the shared auth handler for Observatory split origins', async () => {
    const response = await app.request(
      '/api/auth/get-session', {
        headers: { Origin: 'https://observatory.example' }
      }, environment, executionContext
    )

    expect(response.status).toBe(200)
    expect(mocks.createOwnerAuth).toHaveBeenCalledWith(expect.objectContaining({
      appName: 'Observatory',
      baseURL: 'https://localhost',
      basePath: '/api/auth',
      browserOrigin: 'https://observatory.example',
      cookiePrefix: 'observatory-owner',
      database: environment.DB,
      ownerEmail: environment.OWNER_EMAIL,
      secret: environment.AUTH_SECRET
    }))

    const authOptions: unknown = mocks.createOwnerAuth.mock.calls[0]?.[0]

    expect(isRecord(authOptions) && typeof authOptions.sendVerificationOTP).toBe('function')
    expect(isRecord(authOptions) && typeof authOptions.waitUntil).toBe('function')
  })

  test('authorizes API routes with a shared-package session', async () => {
    const auth = {
      handler: vi.fn(() => Response.json({ authenticated: false })),
      policy: { authServerOrigin: 'https://localhost' },
      resolveSession: vi.fn((_headers: Headers) => Promise.resolve({
        email: environment.OWNER_EMAIL,
        userId: 'owner-user-id'
      }))
    }

    mocks.createOwnerAuth.mockReturnValueOnce(auth)

    const protectedApp = new Hono<WorkerEnv>()

    protectedApp.get('/private', requireAuth, context => context.json({
      email: context.get('sessionEmail')
    }))

    const response = await protectedApp.request(
      '/private', {}, environment, executionContext
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      email: environment.OWNER_EMAIL
    })
  })

  test('accepts the server-only recovery code without returning it', async () => {
    const response = await app.request(
      '/auth/recovery', {
        body: JSON.stringify({ passcode: environment.OWNER_PASSCODE }),
        headers: {
          'CF-Connecting-IP': '203.0.113.20',
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(200)

    const body = await response.text()

    expect(body).not.toContain(environment.OWNER_PASSCODE)
    expect(mocks.recordAuthAttempt).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ succeeded: true })
    )

    const identity = readRequiredString(
      mocks.recordAuthAttempt.mock.calls[0]?.[1],
      'identity',
      'Expected a stored recovery attempt'
    )

    expect(identity).not.toContain('203.0.113.20')
    expect(mocks.insertSession).toHaveBeenCalledOnce()
  })

  test('rate limits recovery attempts before comparing the secret', async () => {
    mocks.countRecentFailedAuthAttempts.mockResolvedValue(5)

    const response = await app.request(
      '/auth/recovery', {
        body: JSON.stringify({ passcode: 'incorrect-code' }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(429)
    expect(mocks.recordAuthAttempt).not.toHaveBeenCalled()
  })
})
