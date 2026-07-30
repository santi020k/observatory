import { describe, expect, test } from 'vitest'

import { app } from './index'

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
})
