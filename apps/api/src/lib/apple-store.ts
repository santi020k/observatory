import type { PublishedApp } from '@santi020k/observatory-catalog'
import type { StoreMetricWrite } from '@santi020k/observatory-db'
import * as z from 'zod'

import type { Bindings } from '../env'

import { createAppleToken } from './provider-auth'
import {
  isSupportedAppleReportName,
  mergeStoreMetricPoints,
  parseStoreReport
} from './store-reports'

export { isSupportedAppleReportName } from './store-reports'

interface AppleResource<Attributes> {
  attributes: Attributes
  id: string
}

interface AppleCollection<Attributes> {
  data: AppleResource<Attributes>[]
  links?: { next?: string }
}

interface AppleReportAttributes {
  category?: string
  name: string
}

interface AppleInstanceAttributes {
  granularity: string
  processingDate?: string
}

interface AppleSegmentAttributes {
  url: string
}

const apiOrigin = 'https://api.appstoreconnect.apple.com'
const requestTimeoutMilliseconds = 20_000
const reportRequestsSchema = z.record(z.string(), z.string().trim())

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

const fetchCollection = async <Attributes>(
  initialUrl: string,
  token: string,
  fetcher: Fetcher
): Promise<AppleResource<Attributes>[]> => {
  const resources: AppleResource<Attributes>[] = []
  let url: string | undefined = initialUrl

  while (url) {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(requestTimeoutMilliseconds)
    })

    if (!response.ok)
      throw new Error(`Apple Analytics request failed with ${response.status}.`)

    const body = await response.json<AppleCollection<Attributes>>()

    resources.push(...body.data)

    url = body.links?.next
  }

  return resources
}

const decodeSegment = async (response: Response): Promise<string> => {
  const bytes = new Uint8Array(await response.arrayBuffer())

  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    return new TextDecoder().decode(bytes)

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('gzip')
  )

  return new Response(stream).text()
}

const isRecentInstance = (
  instance: AppleResource<AppleInstanceAttributes>,
  since: number
): boolean => {
  if (instance.attributes.granularity !== 'DAILY') return false

  const processingDate = Date.parse(instance.attributes.processingDate ?? '')

  return !Number.isFinite(processingDate) || processingDate >= since
}

const getProcessingTime = (
  instance: AppleResource<AppleInstanceAttributes>
): number => {
  const processingTime = Date.parse(instance.attributes.processingDate ?? '')

  return Number.isFinite(processingTime) ? processingTime : 0
}

export const selectLatestAppleInstancePoints = (
  instanceGroups: readonly (readonly StoreMetricWrite[])[]
): StoreMetricWrite[] => {
  const latestByPeriod = new Map<number, readonly StoreMetricWrite[]>()

  for (const group of instanceGroups) {
    const pointsByPeriod = new Map<number, StoreMetricWrite[]>()

    for (const point of group) {
      const points = pointsByPeriod.get(point.periodStart) ?? []

      points.push(point)

      pointsByPeriod.set(point.periodStart, points)
    }

    for (const [periodStart, points] of pointsByPeriod)
      latestByPeriod.set(periodStart, points)
  }

  return [...latestByPeriod.values()].flat()
}

export interface AppleStoreConfiguration {
  issuerId: string
  keyId: string
  privateKey: string
  reportRequestId: string
}

export const readAppleStoreConfiguration = (
  env: Bindings,
  appSlug: string
): AppleStoreConfiguration | null => {
  if (
    !env.APP_STORE_CONNECT_ISSUER_ID ||
    !env.APP_STORE_CONNECT_KEY_ID ||
    !env.APP_STORE_CONNECT_PRIVATE_KEY ||
    !env.APP_STORE_CONNECT_REPORT_REQUESTS_JSON
  ) return null

  const parsed = reportRequestsSchema.safeParse(JSON.parse(
    env.APP_STORE_CONNECT_REPORT_REQUESTS_JSON
  ))

  if (!parsed.success) return null

  const reportRequestId = parsed.data[appSlug]

  if (!reportRequestId) return null

  return {
    issuerId: env.APP_STORE_CONNECT_ISSUER_ID,
    keyId: env.APP_STORE_CONNECT_KEY_ID,
    privateKey: env.APP_STORE_CONNECT_PRIVATE_KEY,
    reportRequestId
  }
}

export const collectAppleStoreMetrics = async (
  app: PublishedApp,
  configuration: AppleStoreConfiguration,
  options: {
    fetcher?: Fetcher
    now?: number
    since: number
  }
): Promise<StoreMetricWrite[]> => {
  if (!app.apple) return []

  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()
  const token = await createAppleToken(configuration, now)

  const reports = await fetchCollection<AppleReportAttributes>(
    `${apiOrigin}/v1/analyticsReportRequests/${encodeURIComponent(configuration.reportRequestId)}/reports?limit=200`,
    token,
    fetcher
  )

  const groups: StoreMetricWrite[][] = []

  for (const report of reports) {
    if (!isSupportedAppleReportName(report.attributes.name)) continue

    const instances = (await fetchCollection<AppleInstanceAttributes>(
      `${apiOrigin}/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?limit=200`,
      token,
      fetcher
    ))
      .filter(candidate => isRecentInstance(
        candidate,
        options.since - 7 * 24 * 60 * 60 * 1_000
      ))
      .sort((left, right) => getProcessingTime(left) - getProcessingTime(right))
      .slice(-1)

    const instanceGroups: StoreMetricWrite[][] = []

    for (const instance of instances) {
      const segments = await fetchCollection<AppleSegmentAttributes>(
        `${apiOrigin}/v1/analyticsReportInstances/${encodeURIComponent(instance.id)}/segments?limit=200`,
        token,
        fetcher
      )

      const segmentGroups: StoreMetricWrite[][] = []

      for (const segment of segments) {
        const response = await fetcher(segment.attributes.url, {
          signal: AbortSignal.timeout(requestTimeoutMilliseconds)
        })

        if (!response.ok)
          throw new Error(`Apple report download failed with ${response.status}.`)

        segmentGroups.push(parseStoreReport({
          appSlug: app.slug,
          collectedAt: now,
          delimiter: '\t',
          provider: 'apple',
          source: report.attributes.name,
          text: await decodeSegment(response)
        }))
      }

      instanceGroups.push(mergeStoreMetricPoints(segmentGroups))
    }

    groups.push(selectLatestAppleInstancePoints(instanceGroups))
  }

  return mergeStoreMetricPoints(groups)
}
