import type {
  AnalyticsRange,
  Dashboard
} from '@santi020k/observatory-api-types'

const dayMilliseconds = 24 * 60 * 60 * 1_000

export const analyticsRangeMeta = {
  '5d': {
    bucketLabel: 'Six-hour',
    days: 5,
    label: '5 days',
    longLabel: 'last 5 days'
  },
  '30d': {
    bucketLabel: 'Daily',
    days: 30,
    label: '30 days',
    longLabel: 'last 30 days'
  },
  '90d': {
    bucketLabel: 'Weekly',
    days: 90,
    label: '90 days',
    longLabel: 'last 90 days'
  },
  ytd: {
    bucketLabel: 'Weekly',
    days: 0,
    label: 'Year to date',
    longLabel: 'year to date'
  },
  '1y': {
    bucketLabel: 'Weekly',
    days: 365,
    label: '1 year',
    longLabel: 'last year'
  },
  '5y': {
    bucketLabel: 'Monthly',
    days: 5 * 365,
    label: '5 years',
    longLabel: 'last 5 years'
  }
} as const satisfies Record<
  AnalyticsRange,
  {
    bucketLabel: string
    days: number
    label: string
    longLabel: string
  }
>

export const analyticsRangeOptions = [
  { label: analyticsRangeMeta['5d'].label, value: '5d' },
  { label: analyticsRangeMeta['30d'].label, value: '30d' },
  { label: analyticsRangeMeta['90d'].label, value: '90d' },
  { label: analyticsRangeMeta.ytd.label, value: 'ytd' },
  { label: analyticsRangeMeta['1y'].label, value: '1y' },
  { label: analyticsRangeMeta['5y'].label, value: '5y' }
] as const satisfies readonly {
  label: string
  value: AnalyticsRange
}[]

const getRangeDays = (range: AnalyticsRange): number => {
  switch (range) {
    case '5d':
      return analyticsRangeMeta['5d'].days

    case '30d':
      return analyticsRangeMeta['30d'].days

    case '90d':
      return analyticsRangeMeta['90d'].days

    case 'ytd': {
      const now = new Date()
      const start = Date.UTC(now.getUTCFullYear(), 0, 1)

      return Math.max(1, Math.ceil((Date.now() - start) / dayMilliseconds))
    }

    case '1y':
      return analyticsRangeMeta['1y'].days

    case '5y':
      return analyticsRangeMeta['5y'].days
  }
}

export const getHistoryCoverage = (
  availableFrom: string | null,
  availableTo: string | null,
  range: AnalyticsRange
): { days: number, isPartial: boolean, label: string } => {
  const from = availableFrom ? Date.parse(availableFrom) : Number.NaN
  const to = availableTo ? Date.parse(availableTo) : Number.NaN

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { days: 0, isPartial: true, label: 'No history stored yet' }
  }

  const days = Math.max(1, Math.floor((to - from) / dayMilliseconds) + 1)

  return {
    days,
    isPartial: days < getRangeDays(range),
    label: `${days.toLocaleString()} day${days === 1 ? '' : 's'} stored`
  }
}

type NpmCadence = 'daily' | 'monthly' | 'weekly' | 'yearly'

const npmChartMeta = {
  '5d': {
    cadence: 'daily',
    caption: 'Completed UTC days across every enabled mapped package.',
    heading: 'Downloads per day'
  },
  '30d': {
    cadence: 'daily',
    caption: 'Completed UTC days across every enabled mapped package.',
    heading: 'Downloads per day'
  },
  '90d': {
    cadence: 'weekly',
    caption: 'Daily downloads grouped into Monday-starting UTC weeks.',
    heading: 'Downloads per week'
  },
  ytd: {
    cadence: 'monthly',
    caption: 'Daily downloads grouped by UTC calendar month.',
    heading: 'Downloads per month'
  },
  '1y': {
    cadence: 'monthly',
    caption: 'Daily downloads grouped by UTC calendar month.',
    heading: 'Downloads per month'
  },
  '5y': {
    cadence: 'yearly',
    caption: 'Daily downloads grouped by UTC calendar year.',
    heading: 'Downloads per year'
  }
} as const satisfies Record<
  AnalyticsRange,
  { cadence: NpmCadence, caption: string, heading: string }
>

type NpmChartSource = Pick<
  Dashboard['npmAnalytics'],
  'daily' | 'monthly' | 'weekly' | 'yearly'
>

export const getNpmChart = (
  analytics: NpmChartSource,
  range: AnalyticsRange
) => {
  const meta = npmChartMeta[range]

  return {
    ...meta,
    points: analytics[meta.cadence]
  }
}

export const formatHistoryLabel = (
  value: string,
  range: AnalyticsRange
): string => new Intl.DateTimeFormat('en', {
  day: 'numeric',
  ...(range === '5d' ? { hour: 'numeric' } : {}),
  month: 'short',
  ...(range === '5y' || range === 'ytd' ? { year: '2-digit' } : {})
}).format(new Date(value))
