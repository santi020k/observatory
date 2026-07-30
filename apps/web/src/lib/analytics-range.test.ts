import { describe, expect, it } from 'vitest'

import { formatHistoryLabel, getHistoryCoverage } from './analytics-range'

describe('analytics range presentation', () => {
  it('reports partial history when the database is younger than the range', () => {
    expect(
      getHistoryCoverage(
        '2026-07-27T00:00:00.000Z',
        '2026-07-30T00:00:00.000Z',
        '30d',
      ),
    ).toEqual({
      days: 3,
      isPartial: true,
      label: '3 days stored',
    })
  })

  it('includes time for the five-day chart labels', () => {
    expect(formatHistoryLabel('2026-07-30T12:00:00.000Z', '5d')).toMatch(/30/)
  })
})
