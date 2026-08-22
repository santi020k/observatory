import { beforeEach, describe, expect, test, vi } from 'vitest'

import { hashValue } from './lib/crypto'

const mocks = vi.hoisted(() => ({
  countRecentFailedAuthAttempts: vi.fn(),
  countRecentAuthCodes: vi.fn(),
  createDb: vi.fn(() => ({ database: 'test' })),
  findLatestUsableCode: vi.fn(),
  insertAuthCode: vi.fn(),
  insertSession: vi.fn(),
  recordAuthAttempt: vi.fn(),
  recordCodeAttempt: vi.fn(),
  sendLoginCode: vi.fn()
}))

vi.mock('@santi020k/observatory-db', async importOriginal => ({
  ...(await importOriginal()),
  countRecentFailedAuthAttempts: mocks.countRecentFailedAuthAttempts,
  countRecentAuthCodes: mocks.countRecentAuthCodes,
  createDb: mocks.createDb,
  findLatestUsableCode: mocks.findLatestUsableCode,
  insertAuthCode: mocks.insertAuthCode,
  insertSession: mocks.insertSession,
  recordAuthAttempt: mocks.recordAuthAttempt,
  recordCodeAttempt: mocks.recordCodeAttempt
}))

vi.mock('./lib/email', () => ({
  sendLoginCode: mocks.sendLoginCode
}))

const { app } = await import('./index')

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

beforeEach(() => {
  vi.clearAllMocks()

  mocks.countRecentAuthCodes.mockResolvedValue(0)
  mocks.countRecentFailedAuthAttempts.mockResolvedValue(0)

  mocks.sendLoginCode.mockResolvedValue({})
})

describe('owner authentication flow', () => {
  test('stores a hashed code and returns the generic request response', async () => {
    const response = await app.request(
      '/auth/request-code', {
        body: JSON.stringify({ email: ' OWNER@example.com ' }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(202)

    await expect(response.json()).resolves.toEqual({
      message: 'If this address is authorized, a verification code is on its way.'
    })

    expect(mocks.insertAuthCode).toHaveBeenCalledOnce()

    const storedCode: unknown = mocks.insertAuthCode.mock.calls[0]?.[1]

    if (
      !storedCode ||
      typeof storedCode !== 'object' ||
      !('codeHash' in storedCode) ||
      typeof storedCode.codeHash !== 'string' ||
      !('email' in storedCode)
    ) {
      throw new TypeError('Expected a stored authentication code')
    }

    expect(storedCode.codeHash).not.toMatch(/^\d{6}$/)

    expect(storedCode.email).toBe('owner@example.com')
  })

  test('consumes a valid code and issues an HttpOnly production session', async () => {
    const code = '123456'

    const codeHash = await hashValue(
      environment.AUTH_SECRET, `owner@example.com:${code}`
    )

    mocks.findLatestUsableCode.mockResolvedValue({
      codeHash,
      id: 'code-id'
    })

    const response = await app.request(
      '/auth/verify-code', {
        body: JSON.stringify({ code, email: 'owner@example.com' }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(200)

    expect(mocks.recordCodeAttempt).toHaveBeenCalledWith(
      expect.anything(), 'code-id', expect.any(Number)
    )

    expect(mocks.insertSession).toHaveBeenCalledOnce()

    const sessionCookie = response.headers.get('set-cookie')

    expect(sessionCookie).toContain('__Secure-observatory_session=')
    expect(sessionCookie).toContain('Domain=observatory.example')
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('Secure')
    expect(sessionCookie).toContain('SameSite=Lax')
  })

  test('accepts the server-only recovery code without returning it', async () => {
    const response = await app.request(
      '/auth/recovery', {
        body: JSON.stringify({ passcode: environment.OWNER_PASSCODE }),
        headers: {
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
