import { describe, expect, test, vi } from 'vitest'

import { proxyBackendRequest, resolveBackendTarget } from './backend-proxy'

const siteOrigin = 'https://observatory.example'
const apiOrigin = 'https://api.observatory.example'

const resolveRequestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof Request) return input.url

  if (input instanceof URL) return input.href

  return input
}

describe('backend proxy', () => {
  test('maps browser API paths to the internal API origin', () => {
    const request = new Request(
      `${siteOrigin}/api/backend/projects/example?range=30d`
    )

    expect(resolveBackendTarget(request, apiOrigin)).toEqual(
      new URL(`${apiOrigin}/projects/example?range=30d`)
    )
  })

  test('forwards the host-only authentication cookie', async () => {
    const fetcher = vi.fn<typeof fetch>((input, init) => {
      expect(resolveRequestUrl(input)).toBe(
        `${apiOrigin}/settings/projects`
      )
      expect(new Headers(init?.headers).get('Cookie')).toBe('session=value')
      expect(init?.method).toBe('POST')

      return Promise.resolve(Response.json({ updated: true }))
    })

    const response = await proxyBackendRequest(new Request(
      `${siteOrigin}/api/backend/settings/projects`, {
        body: JSON.stringify({ pinned: true, slug: 'example' }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=value'
        },
        method: 'POST'
      }
    ), apiOrigin, fetcher)

    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  test('cannot tunnel around the dedicated authentication proxy', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const blockedPaths = [
      'api/auth/update-user',
      'auth/recovery',
      'api%2Fauth/sign-up',
      'api%252Fauth/sign-out',
      'api/%2561uth/update-user',
      '%2F%2Fattacker.example/collect',
      '%5C%5Cattacker.example/collect'
    ]

    for (const path of blockedPaths) {
      const request = new Request(`${siteOrigin}/api/backend/${path}`)

      expect(resolveBackendTarget(request, apiOrigin)).toBeNull()

      const response = await proxyBackendRequest(request, apiOrigin, fetcher)

      expect(response.status).toBe(404)
    }

    expect(fetcher).not.toHaveBeenCalled()
  })

  test('rejects invalid origins and oversized bodies', async () => {
    expect(resolveBackendTarget(
      new Request(`${siteOrigin}/api/backend/dashboard`),
      'http://api.observatory.example'
    )).toBeNull()

    const fetcher = vi.fn<typeof fetch>()
    const response = await proxyBackendRequest(new Request(
      `${siteOrigin}/api/backend/settings/projects`, {
        body: 'x',
        headers: { 'Content-Length': String(256 * 1024 + 1) },
        method: 'POST'
      }
    ), apiOrigin, fetcher)

    expect(response.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
