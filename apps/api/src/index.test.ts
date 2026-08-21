import { describe, expect, test, vi } from 'vitest'

import { app, runDashboardSync } from './index'

describe('dashboard synchronization', () => {
  test('refreshes projects before collecting website analytics', async () => {
    const calls: string[] = []
    const synchronizeProjects = vi.fn(() => {
      calls.push('projects')

      return Promise.resolve(9)
    })
    const synchronizeWebsiteAnalytics = vi.fn(() => {
      calls.push('website analytics')

      return Promise.resolve(3)
    })
    const result = await runDashboardSync(
      {}, synchronizeProjects, synchronizeWebsiteAnalytics
    )

    expect(result).toEqual({ count: 9, websiteAnalyticsCount: 3 })

    expect(synchronizeProjects).toHaveBeenCalledOnce()

    expect(synchronizeWebsiteAnalytics).toHaveBeenCalledOnce()

    expect(calls).toEqual(['projects', 'website analytics'])
  })
})

describe('API request origin protection', () => {
  test('rejects state-changing requests from untrusted browser origins', async () => {
    const response = await app.request(
      '/sync', {
        headers: { Origin: 'https://malicious.example' },
        method: 'POST'
      }, {
        CORS_ORIGIN: 'https://observatory.example'
      }
    )

    expect(response.status).toBe(403)

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_ORIGIN' }
    })
  })

  test('allows registered product origins to reach project feedback routes', async () => {
    const response = await app.request(
      '/api/feedback/projects/postlens/config', {
        headers: { Origin: 'https://postlens.santi020k.com' }
      }, {
        CORS_ORIGIN: 'https://observatory.example',
        ENVIRONMENT: 'test'
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://postlens.santi020k.com'
    )
  })

  test('does not trust product origins for private Observatory mutations', async () => {
    const response = await app.request(
      '/sync', {
        headers: { Origin: 'https://postlens.santi020k.com' },
        method: 'POST'
      }, {
        CORS_ORIGIN: 'https://observatory.example'
      }
    )

    expect(response.status).toBe(403)
  })
})
