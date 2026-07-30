import { describe, expect, test } from 'vitest'

import {
  formatHistoryLabel,
  getHistoryCoverage,
  getNpmChart
} from './analytics-range'

describe('analytics range presentation', () => {
  test('reports partial history when the database is younger than the range', () => {
    expect(
      getHistoryCoverage(
        '2026-07-27T00:00:00.000Z', '2026-07-30T00:00:00.000Z', '30d'
      )
    ).toEqual({
      days: 4,
      isPartial: true,
      label: '4 days stored'
    })
  })

  test('includes time for the five-day chart labels', () => {
    expect(formatHistoryLabel('2026-07-30T12:00:00.000Z', '5d')).toMatch(/30/)
  })

  test.each([
    ['5d', 'daily', 'Downloads per day'],
    ['30d', 'daily', 'Downloads per day'],
    ['90d', 'weekly', 'Downloads per week'],
    ['ytd', 'monthly', 'Downloads per month'],
    ['1y', 'monthly', 'Downloads per month'],
    ['5y', 'yearly', 'Downloads per year']
  ] as const)('selects one useful npm cadence for %s', (
    range, cadence, heading
  ) => {
    const chart = getNpmChart(
      {
        daily: [{ downloads: 1, periodStart: '2026-07-29T00:00:00.000Z' }],
        monthly: [{ downloads: 2, periodStart: '2026-07-01T00:00:00.000Z' }],
        weekly: [{ downloads: 3, periodStart: '2026-07-27T00:00:00.000Z' }],
        yearly: [{ downloads: 4, periodStart: '2026-01-01T00:00:00.000Z' }]
      }, range
    )

    expect(chart).toMatchObject({
      cadence,
      heading
    })

    expect(
      chart.points.every(point => Number.isInteger(point.downloads))
    ).toBe(true)
  })
})
