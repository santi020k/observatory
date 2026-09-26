import { describe, expect, test } from 'vitest'

import { metricContext } from './store-presentation'

describe('store metric presentation', () => {
  test.each([
    'activeDevices',
    'currentDeviceInstalls',
    'currentUserInstalls',
    'totalUserInstalls'
  ] as const)('labels %s as a latest observation', metric => {
    expect(metricContext(metric, 'google', 'last 30 days')).toBe(
      'Latest reported · last 30 days'
    )
  })

  test('labels accumulated metrics as provider totals', () => {
    expect(metricContext(
      'dailyDeviceInstalls', 'google', 'last 30 days'
    )).toBe('Google Play total · last 30 days')
  })
})
