import {
  type AnalyticsRange,
  type StoreAnalytics,
  storeAnalyticsSchema,
  type StoreMetricName,
  storeMetricNameSchema,
  type StoreMetricTotals,
  type StoreProvider } from '@santi020k/observatory-api-types'
import {
  getPublishedApps,
  type PublishedApp
} from '@santi020k/observatory-catalog'
import {
  createDb,
  getLatestStoreSyncRuns,
  getStoreMetricsSince,
  insertStoreSyncRun,
  type StoreMetricProvider,
  type StoreMetricWrite,
  upsertStoreMetrics
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

import {
  collectAppleStoreMetrics,
  readAppleStoreConfiguration
} from './apple-store'
import {
  collectGooglePlayMetrics,
  readGooglePlayConfiguration
} from './google-play'

const dayMilliseconds = 24 * 60 * 60 * 1_000
const backfillMilliseconds = 366 * dayMilliseconds

const getRangeStart = (
  range: AnalyticsRange,
  now: number = Date.now()
): number => {
  const date = new Date(now)

  const today = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  )

  if (range === '5d') return today - 5 * dayMilliseconds

  if (range === '30d') return today - 30 * dayMilliseconds

  if (range === '90d') return today - 90 * dayMilliseconds

  if (range === 'ytd') return Date.UTC(date.getUTCFullYear(), 0, 1)

  if (range === '1y') return today - 365 * dayMilliseconds

  return today - 5 * 365 * dayMilliseconds
}

const safeErrorCode = (error: unknown): string => {
  if (!(error instanceof Error)) return 'UNKNOWN_PROVIDER_ERROR'

  if (error.message.includes('configuration')) return 'INVALID_CONFIGURATION'

  if (error.message.includes('OAuth')) return 'AUTHENTICATION_FAILED'

  if (error.message.includes('401') || error.message.includes('403'))
    return 'PROVIDER_ACCESS_DENIED'

  return 'PROVIDER_REQUEST_FAILED'
}

const recordSync = async (
  env: Bindings,
  appSlug: string,
  provider: StoreMetricProvider,
  status: 'failed' | 'skipped' | 'succeeded',
  startedAt: number,
  records: number,
  errorCode: string | null,
  completedAt: number = Date.now()
): Promise<void> => insertStoreSyncRun(createDb(env.DB), {
  appSlug,
  completedAt,
  errorCode,
  id: crypto.randomUUID(),
  provider,
  records,
  startedAt,
  status
})

const saveProviderMetrics = async (
  env: Bindings,
  app: PublishedApp,
  provider: StoreMetricProvider,
  collect: () => Promise<StoreMetricWrite[]>,
  configured: boolean,
  now: number
): Promise<number> => {
  if (!configured) {
    await recordSync(
      env,
      app.slug,
      provider,
      'skipped',
      now,
      0,
      'NOT_CONFIGURED',
      now
    )

    return 0
  }

  try {
    const points = await collect()

    await upsertStoreMetrics(createDb(env.DB), points)

    await recordSync(
      env,
      app.slug,
      provider,
      'succeeded',
      now,
      points.length,
      null
    )

    return points.length
  } catch (error) {
    const errorCode = safeErrorCode(error)

    await recordSync(
      env,
      app.slug,
      provider,
      'failed',
      now,
      0,
      errorCode
    )

    return 0
  }
}

export const syncStoreAnalytics = async (
  env: Bindings,
  now: number = Date.now()
): Promise<{ points: number }> => {
  const apps = getPublishedApps()
  const since = now - backfillMilliseconds
  let points = 0
  let googleConfiguration: ReturnType<typeof readGooglePlayConfiguration> = null

  try {
    googleConfiguration = readGooglePlayConfiguration(env)
  } catch {
    googleConfiguration = null
  }

  for (const app of apps) {
    if (app.apple) {
      let configuration: ReturnType<typeof readAppleStoreConfiguration> = null

      try {
        configuration = readAppleStoreConfiguration(env, app.slug)
      } catch {
        configuration = null
      }

      points += configuration ?
        await saveProviderMetrics(
          env,
          app,
          'apple',
          () => collectAppleStoreMetrics(app, configuration, { now, since }),
          true,
          now
        ) :
        await saveProviderMetrics(
          env,
          app,
          'apple',
          () => Promise.resolve([]),
          false,
          now
        )
    }

    if (app.google)
      points += googleConfiguration ?
        await saveProviderMetrics(
          env,
          app,
          'google',
          () => collectGooglePlayMetrics(app, googleConfiguration, {
            now,
            since
          }),
          true,
          now
        ) :
        await saveProviderMetrics(
          env,
          app,
          'google',
          () => Promise.resolve([]),
          false,
          now
        )
  }

  return { points }
}

type StorePoint = Awaited<ReturnType<typeof getStoreMetricsSince>>[number]

type StoreRun = Awaited<ReturnType<typeof getLatestStoreSyncRuns>>[number]

const stockMetrics = new Set<StoreMetricName>([
  'activeDevices',
  'currentDeviceInstalls',
  'currentUserInstalls',
  'totalUserInstalls'
])

const aggregateMetrics = (
  points: readonly StorePoint[]
): StoreMetricTotals => {
  const totals: StoreMetricTotals = {}
  const latest = new Map<StoreMetricName, StorePoint>()

  for (const point of points) {
    const parsedMetric = storeMetricNameSchema.safeParse(point.metric)

    if (!parsedMetric.success) continue

    const metric = parsedMetric.data

    if (stockMetrics.has(metric)) {
      const current = latest.get(metric)

      if (!current || point.periodStart >= current.periodStart)
        latest.set(metric, point)

      continue
    }

    totals[metric] = (totals[metric] ?? 0) + point.value
  }

  for (const [metric, point] of latest) totals[metric] = point.value

  return totals
}

const buildHistory = (points: readonly StorePoint[]) => {
  const byPeriod = new Map<number, StorePoint[]>()

  for (const point of points) {
    const periodPoints = byPeriod.get(point.periodStart) ?? []

    periodPoints.push(point)

    byPeriod.set(point.periodStart, periodPoints)
  }

  return [...byPeriod.entries()]
    .sort(([left], [right]) => left - right)
    .map(([periodStart, periodPoints]) => ({
      metrics: aggregateMetrics(periodPoints),
      periodStart: new Date(periodStart).toISOString()
    }))
}

const buildBreakdowns = (points: readonly StorePoint[]) => {
  const byDimension = new Map<string, Map<string, StorePoint[]>>()

  for (const point of points) {
    if (point.dimension === 'overall') continue

    const values = byDimension.get(point.dimension) ??
      new Map<string, StorePoint[]>()

    const valuePoints = values.get(point.dimensionValue) ?? []

    valuePoints.push(point)

    values.set(point.dimensionValue, valuePoints)

    byDimension.set(point.dimension, values)
  }

  return [...byDimension.entries()].flatMap(([dimension, values]) => {
    if (
      dimension !== 'appVersion' &&
      dimension !== 'country' &&
      dimension !== 'device' &&
      dimension !== 'osVersion'
    ) return []

    return [{
      dimension,
      values: [...values.entries()]
        .map(([label, valuePoints]) => ({
          label,
          metrics: aggregateMetrics(valuePoints)
        }))
        .sort((left, right) => {
          const leftReach = left.metrics.installations ??
            left.metrics.currentDeviceInstalls ??
            left.metrics.totalDownloads ??
            left.metrics.dailyDeviceInstalls ??
            0

          const rightReach = right.metrics.installations ??
            right.metrics.currentDeviceInstalls ??
            right.metrics.totalDownloads ??
            right.metrics.dailyDeviceInstalls ??
            0

          return rightReach - leftReach || left.label.localeCompare(right.label)
        })
        .slice(0, 20)
    }]
  })
}

const providerIsConfigured = (
  env: Bindings,
  appSlug: string,
  provider: StoreProvider
): boolean => {
  try {
    return provider === 'apple' ?
      readAppleStoreConfiguration(env, appSlug) !== null :
      readGooglePlayConfiguration(env) !== null
  } catch {
    return false
  }
}

const buildProviderAnalytics = (
  env: Bindings,
  appSlug: string,
  provider: StoreProvider,
  points: readonly StorePoint[],
  runs: readonly StoreRun[]
) => {
  const providerPoints = points.filter(point => point.appSlug === appSlug &&
    point.provider === provider)

  const overallPoints = providerPoints.filter(
    point => point.dimension === 'overall'
  )

  const latestRun = runs.find(run => run.appSlug === appSlug &&
    run.provider === provider)

  let status: 'available' | 'awaiting_data' | 'failed' | 'not_configured'

  if (latestRun?.status === 'failed') status = 'failed'
  else if (!providerIsConfigured(env, appSlug, provider))
    status = 'not_configured'
  else if (providerPoints.length > 0) status = 'available'
  else status = 'awaiting_data'

  const latestCollectedAt = providerPoints.reduce(
    (latest, point) => Math.max(latest, point.collectedAt),
    0
  )

  return {
    breakdowns: buildBreakdowns(providerPoints),
    history: buildHistory(overallPoints),
    lastCollectedAt: latestCollectedAt > 0 ?
      new Date(latestCollectedAt).toISOString() :
      null,
    lastSyncAt: latestRun ?
      new Date(latestRun.completedAt ?? latestRun.startedAt).toISOString() :
      null,
    metrics: aggregateMetrics(overallPoints),
    provider,
    status
  }
}

export const buildStoreAnalytics = async (
  env: Bindings,
  range: AnalyticsRange = '30d',
  now: number = Date.now()
): Promise<StoreAnalytics> => {
  const database = createDb(env.DB)

  const [points, runs] = await Promise.all([
    getStoreMetricsSince(database, getRangeStart(range, now)),
    getLatestStoreSyncRuns(database)
  ])

  return storeAnalyticsSchema.parse({
    apps: getPublishedApps().map(app => ({
      displayName: app.displayName,
      providers: [
        ...(app.apple ?
          [buildProviderAnalytics(
            env,
            app.slug,
            'apple',
            points,
            runs
          )] :
          []),
        ...(app.google ?
          [buildProviderAnalytics(
            env,
            app.slug,
            'google',
            points,
            runs
          )] :
          [])
      ],
      slug: app.slug
    })),
    generatedAt: new Date(now).toISOString(),
    range
  })
}
