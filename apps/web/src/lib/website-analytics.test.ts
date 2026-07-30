import { describe, expect, test } from 'vitest'

import { aggregateWebsiteAnalytics } from './website-analytics'

describe('website analytics chart aggregation', () => {
  test('combines hourly values into six-hour points for the 5-day range', () => {
    expect(
      aggregateWebsiteAnalytics(
        [
          {
            pageViews: 7,
            periodStart: '2026-07-24T08:00:00.000Z',
            sampleInterval: 1,
            visits: 4
          },
          {
            pageViews: 5,
            periodStart: '2026-07-24T11:00:00.000Z',
            sampleInterval: 1,
            visits: 3
          }
        ], '5d'
      )
    ).toEqual([
      {
        pageViews: 12,
        periodStart: '2026-07-24T06:00:00.000Z',
        sampleInterval: 1,
        visits: 7
      }
    ])
  })

  test('combines hourly values into daily points for the 30-day range', () => {
    expect(
      aggregateWebsiteAnalytics(
        [
          {
            pageViews: 7,
            periodStart: '2026-07-24T08:00:00.000Z',
            sampleInterval: 1,
            visits: 4
          },
          {
            pageViews: 5,
            periodStart: '2026-07-24T18:00:00.000Z',
            sampleInterval: 2,
            visits: 3
          }
        ], '30d'
      )
    ).toEqual([
      {
        pageViews: 12,
        periodStart: '2026-07-24T00:00:00.000Z',
        sampleInterval: 2,
        visits: 7
      }
    ])
  })

  test('combines values into monthly points for longer ranges', () => {
    const points = aggregateWebsiteAnalytics(
      [
        {
          pageViews: 10,
          periodStart: '2026-06-04T00:00:00.000Z',
          sampleInterval: 1,
          visits: 6
        },
        {
          pageViews: 20,
          periodStart: '2026-06-20T00:00:00.000Z',
          sampleInterval: 1,
          visits: 12
        }
      ], '1y'
    )

    expect(points).toHaveLength(1)

    expect(points[0]).toMatchObject({
      pageViews: 30,
      periodStart: '2026-06-01T00:00:00.000Z',
      visits: 18
    })
  })

  test('combines values into weekly points for the 90-day range', () => {
    const points = aggregateWebsiteAnalytics(
      [
        {
          pageViews: 10,
          periodStart: '2026-07-06T00:00:00.000Z',
          sampleInterval: 1,
          visits: 6
        },
        {
          pageViews: 20,
          periodStart: '2026-07-11T00:00:00.000Z',
          sampleInterval: 1,
          visits: 12
        }
      ], '90d'
    )

    expect(points).toHaveLength(1)

    expect(points[0]).toMatchObject({
      pageViews: 30,
      periodStart: '2026-07-06T00:00:00.000Z',
      visits: 18
    })
  })
})
