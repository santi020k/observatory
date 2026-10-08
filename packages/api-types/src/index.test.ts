import { describe, expect, test } from 'vitest'

import {
  analyticsRangeSchema,
  createFeedbackSchema,
  dashboardSchema,
  projectDashboardSchema,
  recoveryLoginSchema,
  storeAnalyticsSchema,
  updateProjectSettingSchema,
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
    expect(projectDashboardSchema.shape.growth).toBeDefined()
    expect(projectDashboardSchema.shape.releaseAnalytics).toBeDefined()
    expect(projectDashboardSchema.shape.operationalHealth).toBeDefined()
  })

  test('exposes explainable per-project growth signals', () => {
    const growthShape = dashboardSchema.shape.growth.element.shape

    expect(growthShape.downloadVelocityChange).toBeDefined()
    expect(growthShape.npmDownloads30dTrend).toBeDefined()
    expect(growthShape.observations).toBeDefined()
    expect(growthShape.signal).toBeDefined()
    expect(growthShape.slug).toBeDefined()
    expect(growthShape.starsGained).toBeDefined()
  })
})

describe('feedback contracts', () => {
  test('accepts website ideas and native diagnostic bug reports', () => {
    expect(
      createFeedbackSchema.safeParse({
        description: 'A detailed idea for the product roadmap.',
        locale: 'en',
        title: 'Add a calmer reminder',
        type: 'idea'
      }).success
    ).toBe(true)

    expect(
      createFeedbackSchema.safeParse({
        description: 'The editor closes after choosing a photo.',
        diagnosticReport: 'device=iPhone; build=1',
        locale: 'en',
        source: 'ios',
        title: 'Editor closes unexpectedly',
        type: 'bug'
      }).success
    ).toBe(true)
  })

  test('rejects diagnostics attached to public ideas', () => {
    expect(
      createFeedbackSchema.safeParse({
        description: 'A detailed idea for the product roadmap.',
        diagnosticReport: 'private diagnostic data',
        locale: 'en',
        title: 'Add a calmer reminder',
        type: 'idea'
      }).success
    ).toBe(false)
  })
})

describe('authentication contracts', () => {
  test('keeps recovery codes bounded without restricting symbols', () => {
    expect(
      recoveryLoginSchema.safeParse({ passcode: 'private@@' }).success
    ).toBe(true)
    expect(recoveryLoginSchema.safeParse({ passcode: 'short' }).success).toBe(
      false
    )
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

describe('store analytics contracts', () => {
  test('keeps provider meanings and device breakdowns explicit', () => {
    expect(storeAnalyticsSchema.safeParse({
      apps: [{
        displayName: 'PostLens',
        providers: [{
          breakdowns: [{
            dimension: 'device',
            values: [{ label: 'iPhone', metrics: { installations: 4 } }]
          }],
          history: [{
            metrics: { firstTimeDownloads: 3, installations: 4 },
            periodStart: '2026-09-22T00:00:00.000Z'
          }],
          lastCollectedAt: '2026-09-23T00:00:00.000Z',
          lastSyncAt: '2026-09-23T00:00:00.000Z',
          listingUrl: 'https://apps.apple.com/app/id6804601300',
          metrics: { firstTimeDownloads: 3, installations: 4 },
          provider: 'apple',
          status: 'available'
        }],
        slug: 'postlens'
      }],
      generatedAt: '2026-09-23T00:00:00.000Z',
      range: '30d'
    }).success).toBe(true)
  })
})
