import { describe, expect, test } from 'vitest'

import {
  analyticsRangeSchema,
  projectDashboardSchema,
  requestCodeSchema,
  updateProjectSettingSchema,
  verifyCodeSchema,
  websiteAnalyticsSchema
} from './index'

describe('analytics range contracts', () => {
  test('supports short, medium, and long persisted history windows', () => {
    expect(
      ['5d', '30d', '90d', 'ytd', '1y', '5y'].every(
        range => analyticsRangeSchema.safeParse(range).success
      )
    ).toBe(true)
  })

  test('includes range-owned npm analytics on project dashboards', () => {
    expect(projectDashboardSchema.shape.npmAnalytics).toBeDefined()
  })
})

describe('authentication contracts', () => {
  test('normalizes owner email addresses', () => {
    expect(requestCodeSchema.parse({ email: ' SANTI@EXAMPLE.COM ' })).toEqual({
      email: 'santi@example.com'
    })
  })

  test('only accepts six digit verification codes', () => {
    expect(
      verifyCodeSchema.safeParse({ code: '123456', email: 'santi@example.com' })
        .success
    ).toBe(true)

    expect(
      verifyCodeSchema.safeParse({ code: '12345a', email: 'santi@example.com' })
        .success
    ).toBe(false)
  })
})

describe('project setting contracts', () => {
  test('accepts each supported project preference independently', () => {
    expect(
      updateProjectSettingSchema.safeParse({
        pinned: true,
        slug: 'observatory'
      }).success
    ).toBe(true)

    expect(
      updateProjectSettingSchema.safeParse({
        attentionMode: 'health',
        slug: 'observatory'
      }).success
    ).toBe(true)
  })

  test('rejects empty updates and unsupported attention modes', () => {
    expect(
      updateProjectSettingSchema.safeParse({ slug: 'observatory' }).success
    ).toBe(false)

    expect(
      updateProjectSettingSchema.safeParse({
        attentionMode: 'urgent',
        slug: 'observatory'
      }).success
    ).toBe(false)
  })
})

describe('website analytics contracts', () => {
  test('accepts an hourly Cloudflare analytics series', () => {
    expect(
      websiteAnalyticsSchema.safeParse({
        generatedAt: '2026-07-25T00:00:00.000Z',
        range: '30d',
        sites: [
          {
            history: [
              {
                pageViews: 12,
                periodStart: '2026-07-24T23:00:00.000Z',
                sampleInterval: 1,
                visits: 8
              }
            ],
            hostname: 'santi.dev',
            pageViews: 12,
            slug: 'website',
            visits: 8
          }
        ]
      }).success
    ).toBe(true)
  })
})
