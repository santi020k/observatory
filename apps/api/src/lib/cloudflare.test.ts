import { afterEach, describe, expect, it, vi } from 'vitest'

import { cloudflareInternals } from './cloudflare'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Cloudflare Web Analytics collection', () => {
  it('queries only configured project hostnames and normalizes hourly rows', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        Response.json({
          data: {
            viewer: {
              accounts: [
                {
                  site0: [
                    {
                      avg: { sampleInterval: 2.5 },
                      count: 12,
                      dimensions: {
                        datetimeHour: '2026-07-25T10:00:00Z',
                      },
                      sum: { visits: 8 },
                    },
                  ],
                },
              ],
            },
          },
        }),
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    vi.stubGlobal('crypto', { randomUUID: () => 'snapshot-id' })

    const rows = await cloudflareInternals.fetchCloudflareAnalytics(
      'account-id',
      'api-token',
      [{ hostname: 'santi.dev', slug: 'website' }],
      Date.parse('2026-07-25T09:00:00Z'),
      Date.parse('2026-07-25T11:00:00Z'),
    )

    expect(rows).toEqual([
      expect.objectContaining({
        hostname: 'santi.dev',
        id: 'snapshot-id',
        pageViews: 12,
        periodStart: Date.parse('2026-07-25T10:00:00Z'),
        sampleInterval: 2.5,
        slug: 'website',
        visits: 8,
      }),
    ])

    const request = fetchMock.mock.calls[0]?.[1]
    const requestBody = request?.body

    if (typeof requestBody !== 'string') {
      throw new TypeError('Expected a serialized GraphQL request body')
    }

    const body = JSON.parse(requestBody) as {
      query: string
      variables: Record<string, string>
    }

    expect(body.query).toContain('bot: 0')

    expect(body.query).toContain('requestHost: $hostname0')

    expect(body.variables.hostname0).toBe('santi.dev')

    expect(body.query).not.toContain('santi.dev')
  })

  it('rejects GraphQL errors even when Cloudflare returns HTTP 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({ errors: [{ message: 'not authorized' }] }),
        ),
      ),
    )

    await expect(
      cloudflareInternals.fetchCloudflareAnalytics(
        'account-id',
        'api-token',
        [{ hostname: 'santi.dev', slug: 'website' }],
        0,
        1,
      ),
    ).rejects.toThrow('not authorized')
  })
})
