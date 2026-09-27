import { describe, expect, test, vi } from 'vitest'

import {
  proxyAuthRequest,
  resolveAuthProxyTarget
} from './auth-proxy'

const siteOrigin = 'https://observatory.example'
const apiOrigin = 'https://api.observatory.example'

describe('auth proxy', () => {
  test('maps an allowed same-origin endpoint to the internal auth handler', () => {
    const request = new Request(
      `${siteOrigin}/api/auth/get-session?disableCookieCache=true`
    )

    expect(resolveAuthProxyTarget(request, apiOrigin)).toEqual({
      allowedMethods: ['GET'],
      target: new URL(
        `${apiOrigin}/api/auth/get-session?disableCookieCache=true`
      )
    })
  })

  test('rejects unknown endpoints, unsupported methods, and unsafe origins', () => {
    expect(resolveAuthProxyTarget(
      new Request(`${siteOrigin}/api/auth/sign-up/email`, {
        method: 'POST'
      }), apiOrigin
    )).toEqual({ allowedMethods: [], target: null })

    expect(resolveAuthProxyTarget(
      new Request(`${siteOrigin}/api/auth/get-session`, {
        method: 'DELETE'
      }), apiOrigin
    )).toEqual({ allowedMethods: ['GET'], target: null })

    expect(resolveAuthProxyTarget(
      new Request(`${siteOrigin}/api/auth/get-session`),
      'http://api.observatory.example'
    )).toEqual({ allowedMethods: ['GET'], target: null })
  })

  test('forwards cookies and origin while preserving the host-only response cookie', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      let requestUrl: string

      if (input instanceof Request) requestUrl = input.url
      else if (input instanceof URL) requestUrl = input.href
      else requestUrl = input

      expect(requestUrl).toBe(`${apiOrigin}/api/auth/sign-in/email-otp`)
      expect(new Headers(init?.headers).get('Cookie')).toBe('pilot=session')
      expect(new Headers(init?.headers).get('Origin')).toBe(siteOrigin)
      expect(init?.method).toBe('POST')
      expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toContain(
        'owner@example.com'
      )

      return Promise.resolve(Response.json({ ok: true }, {
        headers: {
          'Set-Cookie': '__Secure-observatory-owner.session=value; Path=/; HttpOnly; Secure'
        }
      }))
    })

    const response = await proxyAuthRequest(new Request(
      `${siteOrigin}/api/auth/sign-in/email-otp`, {
        body: JSON.stringify({ email: 'owner@example.com', otp: '123456' }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'pilot=session',
          Origin: siteOrigin
        },
        method: 'POST'
      }
    ), apiOrigin, fetcher)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Set-Cookie')).toContain(
      '__Secure-observatory-owner.session=value'
    )
  })

  test('rejects oversized auth payloads before contacting the API', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await proxyAuthRequest(new Request(
      `${siteOrigin}/api/auth/sign-in/email-otp`, {
        body: 'x',
        headers: { 'Content-Length': String(128 * 1024 + 1) },
        method: 'POST'
      }
    ), apiOrigin, fetcher)

    expect(response.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
