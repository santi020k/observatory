import type {
  AnalyticsRange,
  WebsiteAnalyticsPoint,
} from '@santi020k/observatory-api-types'

const getBucketStart = (
  periodStart: string,
  range: AnalyticsRange,
): number | null => {
  const date = new Date(periodStart)

  if (!Number.isFinite(date.getTime())) return null

  date.setUTCMinutes(0, 0, 0)

  if (range === '30d') {
    date.setUTCHours(0)
  } else {
    date.setUTCDate(1)

    date.setUTCHours(0)
  }

  return date.getTime()
}

export const aggregateWebsiteAnalytics = (
  history: readonly WebsiteAnalyticsPoint[],
  range: AnalyticsRange,
): WebsiteAnalyticsPoint[] => {
  const buckets = new Map<number, WebsiteAnalyticsPoint>()

  for (const point of history) {
    const bucketStart = getBucketStart(point.periodStart, range)

    if (bucketStart === null) continue

    const current = buckets.get(bucketStart)

    buckets.set(bucketStart, {
      pageViews: (current?.pageViews ?? 0) + point.pageViews,
      periodStart: new Date(bucketStart).toISOString(),
      sampleInterval: Math.max(
        current?.sampleInterval ?? 1,
        point.sampleInterval,
      ),
      visits: (current?.visits ?? 0) + point.visits,
    })
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point)
}
