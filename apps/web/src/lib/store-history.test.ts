import { describe, expect, test } from 'vitest'

import { createStoreMetricHistory } from './store-history'

describe('provider history presentation', () => {
  test('preserves reported zero and missing observations independently', () => {
    const data = createStoreMetricHistory([
      { periodStart: '2026-10-01', metrics: { totalDownloads: 0 } },
      { periodStart: '2026-10-02', metrics: {} },
      { periodStart: '2026-10-03', metrics: { totalDownloads: 12 } }
    ], 'totalDownloads', '30d')

    expect(data.map(point => point.y)).toEqual([0, null, 12])
    expect(data[0]?.label).toContain('0')
    expect(data[1]?.label).toBeUndefined()
    expect(data.map(point => point.x)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
  test('keeps period keys independent of potentially repeated display labels', () => {
    const data = createStoreMetricHistory([
      { periodStart: '2025-10-01', metrics: { totalDownloads: 1 } },
      { periodStart: '2026-10-01', metrics: { totalDownloads: 2 } }
    ], 'totalDownloads', '30d')

    expect(data[0]?.xLabel).toBe(data[1]?.xLabel)
    expect(new Set(data.map(point => point.x)).size).toBe(2)
    expect(createStoreMetricHistory([], 'totalDownloads', '30d')).toEqual([])
  })
})
