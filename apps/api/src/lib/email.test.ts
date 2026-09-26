import { afterEach, describe, expect, test, vi } from 'vitest'

import type { Bindings } from '../env'

import { sendFeedbackNotification, sendLoginCode } from './email'

const environment: Bindings = {
  AUTH_SECRET: 'test-secret',
  CORS_ORIGIN: 'https://observatory.example',
  DB: {} as D1Database,
  ENVIRONMENT: 'production',
  MAIL_FROM: 'Observatory <observatory@example.com>',
  OWNER_EMAIL: 'owner@example.com',
  OWNER_PASSCODE: 'test-passcode',
  RESEND_API_KEY: 'test-resend-key',
  SITE_URL: 'https://observatory.example'
}

const parseRequestBody = (requestInit: RequestInit | undefined): unknown => {
  if (typeof requestInit?.body !== 'string')
    throw new TypeError('Expected a JSON request body')

  return JSON.parse(requestInit.body)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('email delivery', () => {
  test('sends login codes through the shared Resend request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    await sendLoginCode(environment, 'owner@example.com', '123456')

    expect(fetchMock).toHaveBeenCalledOnce()
    const requestInit: RequestInit | undefined = fetchMock.mock.calls[0]?.[1]

    expect(parseRequestBody(requestInit)).toMatchObject({
      subject: '123456 is your Observatory code',
      to: ['owner@example.com']
    })
  })

  test('sends escaped feedback details and a private board link to the owner', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)

    await sendFeedbackNotification(environment, {
      contactEmail: 'person@example.com',
      description: 'The <button> does not work & blocks progress.',
      diagnosticReport: 'Version: <1.0>',
      id: 'feedback-123',
      locale: 'en',
      projectDisplayName: 'PostLens',
      projectSlug: 'postlens',
      source: 'ios',
      title: 'Publishing <fails>',
      type: 'bug'
    })

    expect(fetchMock).toHaveBeenCalledOnce()

    const requestInit: RequestInit | undefined = fetchMock.mock.calls[0]?.[1]
    const requestBody = parseRequestBody(requestInit)

    expect(requestBody).toMatchObject({
      subject: 'New bug for PostLens',
      to: ['owner@example.com']
    })
    expect(requestBody).toHaveProperty(
      'text',
      expect.stringContaining('person@example.com')
    )
    expect(requestBody).toHaveProperty(
      'text',
      expect.stringContaining(
        'https://observatory.example/projects/postlens/feedback/'
      )
    )
    expect(requestBody).toHaveProperty(
      'html',
      expect.stringContaining('Publishing &lt;fails&gt;')
    )
    expect(requestBody).not.toHaveProperty(
      'html',
      expect.stringContaining('Publishing <fails>')
    )
  })

  test('skips feedback email in local development when Resend is not configured', async () => {
    const fetchMock = vi.fn()
    const localEnvironment: Bindings = {
      ...environment,
      ENVIRONMENT: 'development'
    }

    delete localEnvironment.RESEND_API_KEY

    vi.stubGlobal('fetch', fetchMock)

    await sendFeedbackNotification(localEnvironment, {
      contactEmail: null,
      description: 'This is a sufficiently detailed support message.',
      diagnosticReport: null,
      id: 'feedback-123',
      locale: 'en',
      projectDisplayName: 'RoadScore',
      projectSlug: 'roadscore',
      source: 'website',
      title: 'Please contact me',
      type: 'message'
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('reports provider failures to the background task', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    )

    await expect(sendFeedbackNotification(environment, {
      contactEmail: null,
      description: 'This is a sufficiently detailed feature request.',
      diagnosticReport: null,
      id: 'feedback-123',
      locale: 'es',
      projectDisplayName: 'Between Contractions',
      projectSlug: 'between-contractions',
      source: 'android',
      title: 'Add an export view',
      type: 'idea'
    })).rejects.toThrow('Email provider returned 503')
  })
})
