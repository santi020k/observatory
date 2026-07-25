import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashValue } from './lib/crypto'

const mocks = vi.hoisted(() => ({
  countRecentAuthCodes: vi.fn(),
  createDb: vi.fn(() => ({ database: 'test' })),
  findLatestUsableCode: vi.fn(),
  insertAuthCode: vi.fn(),
  insertSession: vi.fn(),
  recordCodeAttempt: vi.fn(),
  sendLoginCode: vi.fn(),
}))

vi.mock('@santi020k/observatory-db', async (importOriginal) => ({
  ...(await importOriginal()),
  countRecentAuthCodes: mocks.countRecentAuthCodes,
  createDb: mocks.createDb,
  findLatestUsableCode: mocks.findLatestUsableCode,
  insertAuthCode: mocks.insertAuthCode,
  insertSession: mocks.insertSession,
  recordCodeAttempt: mocks.recordCodeAttempt,
}))

vi.mock('./lib/email', () => ({
  sendLoginCode: mocks.sendLoginCode,
}))

const { app } = await import('./index')

const environment = {
  AUTH_SECRET: 'test-auth-secret-that-is-long-enough',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {},
  ENVIRONMENT: 'production',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com',
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.countRecentAuthCodes.mockResolvedValue(0)

  mocks.sendLoginCode.mockResolvedValue({})
})

describe('owner authentication flow', () => {
  it('stores a hashed code and returns the generic request response', async () => {
    const response = await app.request(
      '/auth/request-code',
      {
        body: JSON.stringify({ email: ' OWNER@example.com ' }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example',
        },
        method: 'POST',
      },
      environment,
    )

    expect(response.status).toBe(202)

    await expect(response.json()).resolves.toEqual({
      message: 'If this address is authorized, a verification code is on its way.',
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

  it('consumes a valid code and issues an HttpOnly production session', async () => {
    const code = '123456'

    const codeHash = await hashValue(
      environment.AUTH_SECRET,
      `owner@example.com:${code}`,
    )

    mocks.findLatestUsableCode.mockResolvedValue({
      codeHash,
      id: 'code-id',
    })

    const response = await app.request(
      '/auth/verify-code',
      {
        body: JSON.stringify({ code, email: 'owner@example.com' }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://observatory.example',
        },
        method: 'POST',
      },
      environment,
    )

    expect(response.status).toBe(200)

    expect(mocks.recordCodeAttempt).toHaveBeenCalledWith(
      expect.anything(),
      'code-id',
      expect.any(Number),
    )

    expect(mocks.insertSession).toHaveBeenCalledOnce()

    expect(response.headers.get('set-cookie')).toMatch(
      /^__Host-observatory_session=.*HttpOnly.*Secure.*SameSite=Lax/,
    )
  })
})
