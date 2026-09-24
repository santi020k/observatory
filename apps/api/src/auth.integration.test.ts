import { beforeEach, describe, expect, test, vi } from 'vitest'

import { hashValue } from './lib/crypto'

const mocks = vi.hoisted(() => ({
  consumeAuthCode: vi.fn(),
  countRecentFailedAuthAttempts: vi.fn(),
  countRecentAuthCodes: vi.fn(),
  createDb: vi.fn(() => ({ database: 'test' })),
  findLatestUsableCode: vi.fn(),
  insertAuthCode: vi.fn(),
  insertSession: vi.fn(),
  recordAuthAttempt: vi.fn(),
  recordCodeAttempt: vi.fn(),
  sendLoginCode: vi.fn(),
  tryInsertAuthCodeRequest: vi.fn()
}))

vi.mock('@santi020k/observatory-db', async importOriginal => ({
  ...(await importOriginal()),
  consumeAuthCode: mocks.consumeAuthCode,
  countRecentFailedAuthAttempts: mocks.countRecentFailedAuthAttempts,
  countRecentAuthCodes: mocks.countRecentAuthCodes,
  createDb: mocks.createDb,
  findLatestUsableCode: mocks.findLatestUsableCode,
  insertAuthCode: mocks.insertAuthCode,
  insertSession: mocks.insertSession,
  recordAuthAttempt: mocks.recordAuthAttempt,
  recordCodeAttempt: mocks.recordCodeAttempt,
  tryInsertAuthCodeRequest: mocks.tryInsertAuthCodeRequest
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

  mocks.consumeAuthCode.mockResolvedValue(true)
  mocks.countRecentAuthCodes.mockResolvedValue(0)
  mocks.countRecentFailedAuthAttempts.mockResolvedValue(0)

  mocks.sendLoginCode.mockResolvedValue({})
  mocks.tryInsertAuthCodeRequest.mockResolvedValue(true)
})

describe('owner authentication flow', () => {
  test('stores a hashed code and returns the generic request response', async () => {
    const response = await app.request(
      '/auth/request-code', {
        body: JSON.stringify({ email: ' OWNER@example.com ' }),
        headers: {
          'CF-Connecting-IP': '203.0.113.10',
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment, executionContext
    )

    expect(response.status).toBe(202)

    await expect(response.json()).resolves.toEqual({
      message: 'If this address is authorized, a verification code is on its way.'
    })

    expect(mocks.insertAuthCode).toHaveBeenCalledOnce()
    expect(executionContext.waitUntil).toHaveBeenCalledOnce()
    expect(mocks.tryInsertAuthCodeRequest).toHaveBeenCalledOnce()

    const identityHash = readRequiredString(
      mocks.tryInsertAuthCodeRequest.mock.calls[0]?.[1],
      'identityHash',
      'Expected a stored authentication code request'
    )

    expect(identityHash).not.toContain('203.0.113.10')

    const storedCode: unknown = mocks.insertAuthCode.mock.calls[0]?.[1]
    const codeHash = readRequiredString(
      storedCode, 'codeHash', 'Expected a stored authentication code'
    )
    const email = readRequiredString(
      storedCode, 'email', 'Expected a stored authentication code'
    )

    expect(codeHash).not.toMatch(/^\d{6}$/)
    expect(email).toBe('owner@example.com')
  })

  test('counts unauthorized requests without revealing the owner email', async () => {
    const response = await app.request(
      '/auth/request-code', {
        body: JSON.stringify({ email: 'someone@example.com' }),
        headers: {
          'CF-Connecting-IP': '203.0.113.11',
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment, executionContext
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      message: 'If this address is authorized, a verification code is on its way.'
    })
    expect(mocks.tryInsertAuthCodeRequest).toHaveBeenCalledOnce()
    expect(mocks.countRecentAuthCodes).toHaveBeenCalledOnce()
    expect(executionContext.waitUntil).toHaveBeenCalledOnce()
    expect(mocks.insertAuthCode).not.toHaveBeenCalled()
    expect(mocks.sendLoginCode).not.toHaveBeenCalled()
  })

  test('silently throttles repeated code requests from one client', async () => {
    mocks.tryInsertAuthCodeRequest.mockResolvedValue(false)

    const response = await app.request(
      '/auth/request-code', {
        body: JSON.stringify({ email: 'owner@example.com' }),
        headers: {
          'CF-Connecting-IP': '203.0.113.12',
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(202)
    expect(mocks.tryInsertAuthCodeRequest).toHaveBeenCalledOnce()
    expect(mocks.insertAuthCode).not.toHaveBeenCalled()
    expect(mocks.sendLoginCode).not.toHaveBeenCalled()
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

    expect(mocks.consumeAuthCode).toHaveBeenCalledWith(
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

  test('rejects a valid code when another request consumed it first', async () => {
    const code = '123456'
    const codeHash = await hashValue(
      environment.AUTH_SECRET, `owner@example.com:${code}`
    )

    mocks.findLatestUsableCode.mockResolvedValue({
      codeHash,
      id: 'code-id'
    })
    mocks.consumeAuthCode.mockResolvedValue(false)

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

    expect(response.status).toBe(401)
    expect(mocks.insertSession).not.toHaveBeenCalled()
  })

  test('records one database attempt for an incorrect owner code', async () => {
    mocks.findLatestUsableCode.mockResolvedValue({
      codeHash: await hashValue(
        environment.AUTH_SECRET, 'owner@example.com:654321'
      ),
      id: 'code-id'
    })

    const response = await app.request(
      '/auth/verify-code', {
        body: JSON.stringify({
          code: '123456',
          email: 'owner@example.com'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(401)
    expect(mocks.recordCodeAttempt).toHaveBeenCalledOnce()
    expect(mocks.insertSession).not.toHaveBeenCalled()
  })

  test('uses the database verification path for an unauthorized email', async () => {
    mocks.findLatestUsableCode.mockResolvedValue(null)

    const response = await app.request(
      '/auth/verify-code', {
        body: JSON.stringify({
          code: '123456',
          email: 'someone@example.com'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example'
        },
        method: 'POST'
      }, environment
    )

    expect(response.status).toBe(401)
    expect(mocks.findLatestUsableCode).toHaveBeenCalledWith(
      expect.anything(), 'someone@example.com', expect.any(Number)
    )
    expect(mocks.recordCodeAttempt).toHaveBeenCalledWith(
      expect.anything(), expect.any(String)
    )
    expect(mocks.insertSession).not.toHaveBeenCalled()
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
