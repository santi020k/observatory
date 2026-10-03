import type { AnalyticsRange, StoreMetricName, StoreProviderAnalytics } from '@santi020k/observatory-api-types'

import { formatHistoryLabel } from './analytics-range'
import { formatNumber } from './format'
import { metricLabels } from './store-presentation'

/** Missing provider observations remain gaps; display labels never become period identities. */
export const createStoreMetricHistory = (
  history: StoreProviderAnalytics['history'], metric: StoreMetricName, range: AnalyticsRange
) => history.map(point => {
  const value = point.metrics[metric]

  return {
    ...(value === undefined ? {} : { label: `${formatNumber(value)} ${metricLabels[metric].toLocaleLowerCase('en')}` }),
    x: point.periodStart,
    xLabel: formatHistoryLabel(point.periodStart, range),
    y: value ?? null
  }
})
