import { describe, expect, it } from 'vitest'

import { aggregateWebsiteAnalytics } from './website-analytics'

describe('website analytics chart aggregation', () => {
  it('combines hourly values into daily points for the 30-day range', () => {
    expect(
      aggregateWebsiteAnalytics(
        [
          {
            pageViews: 7,
            periodStart: '2026-07-24T08:00:00.000Z',
            sampleInterval: 1,
            visits: 4,
          },
          {
            pageViews: 5,
            periodStart: '2026-07-24T18:00:00.000Z',
            sampleInterval: 2,
            visits: 3,
          },
        ],
        '30d',
      ),
    ).toEqual([
      {
        pageViews: 12,
        periodStart: '2026-07-24T00:00:00.000Z',
        sampleInterval: 2,
        visits: 7,
      },
    ])
  })

  it('combines values into monthly points for longer ranges', () => {
    const points = aggregateWebsiteAnalytics(
      [
        {
          pageViews: 10,
          periodStart: '2026-06-04T00:00:00.000Z',
          sampleInterval: 1,
          visits: 6,
        },
        {
          pageViews: 20,
          periodStart: '2026-06-20T00:00:00.000Z',
          sampleInterval: 1,
          visits: 12,
        },
      ],
      '1y',
    )

    expect(points).toHaveLength(1)

    expect(points[0]).toMatchObject({
      pageViews: 30,
      periodStart: '2026-06-01T00:00:00.000Z',
      visits: 18,
    })
  })
})
