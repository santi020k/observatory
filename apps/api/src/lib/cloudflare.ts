import {
  type AnalyticsRange,
  type WebsiteAnalytics,
  websiteAnalyticsSchema,
} from '@santi020k/observatory-api-types'
import {
  createDb,
  getAnalyticsWebsites,
  getWebsiteAnalyticsSince,
  upsertWebsiteAnalytics,
  type WebsiteAnalyticsWrite,
} from '@santi020k/observatory-db'

import type { Bindings } from '../env'

const graphqlEndpoint = 'https://api.cloudflare.com/client/v4/graphql'
const hourMilliseconds = 60 * 60 * 1_000
const collectionWindowMilliseconds = 48 * hourMilliseconds
const websitesPerRequest = 10

const getRangeMilliseconds = (range: AnalyticsRange): number => {
  if (range === '30d') return 30 * 24 * hourMilliseconds

  if (range === '1y') return 365 * 24 * hourMilliseconds

  return 5 * 365 * 24 * hourMilliseconds
}

interface CloudflareAnalyticsRow {
  avg: { sampleInterval: number }
  count: number
  dimensions: { datetimeHour: string }
  sum: { visits: number }
}

interface CloudflareGraphqlResponse {
  data?: {
    viewer: {
      accounts: Record<string, CloudflareAnalyticsRow[]>[]
    }
  }
  errors?: { message: string }[]
}

interface AnalyticsWebsite {
  hostname: string
  slug: string
}

const buildQuery = (websites: readonly AnalyticsWebsite[]): string => {
  const hostnameVariables = websites
    .map((_, index) => `$hostname${index}: string!`)
    .join(', ')

  const siteQueries = websites
    .map(
      (_, index) => `
        site${index}: rumPageloadEventsAdaptiveGroups(
          filter: {
            bot: 0
            datetime_geq: $start
            datetime_lt: $end
            requestHost: $hostname${index}
          }
          limit: 1000
          orderBy: [datetimeHour_ASC]
        ) {
          avg {
            sampleInterval
          }
          count
          dimensions {
            datetimeHour
          }
          sum {
            visits
          }
        }`,
    )
    .join('\n')

  return `
    query WebsiteAnalytics(
      $accountTag: string!
      $start: Time!
      $end: Time!
      ${hostnameVariables}
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          ${siteQueries}
        }
      }
    }`
}

const fetchCloudflareAnalytics = async (
  accountId: string,
  apiToken: string,
  websites: readonly AnalyticsWebsite[],
  start: number,
  end: number,
): Promise<WebsiteAnalyticsWrite[]> => {
  if (websites.length === 0) return []

  const variables: Record<string, string> = {
    accountTag: accountId,
    end: new Date(end).toISOString(),
    start: new Date(start).toISOString(),
  }

  for (const [index, website] of websites.entries()) {
    variables[`hostname${index}`] = website.hostname
  }

  const response = await fetch(graphqlEndpoint, {
    body: JSON.stringify({ query: buildQuery(websites), variables }),
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(
      `Cloudflare Analytics request failed with ${response.status}`,
    )
  }

  const result = await response.json<CloudflareGraphqlResponse>()
  const errors = result.errors?.map((error) => error.message).join('; ')

  if (errors) throw new Error(`Cloudflare Analytics query failed: ${errors}`)

  const account = result.data?.viewer.accounts[0]

  if (!account) {
    throw new Error('Cloudflare Analytics returned no accessible account')
  }

  const collectedAt = Date.now()

  return websites.flatMap((website, index) =>
    (account[`site${index}`] ?? []).map((row) => {
      const periodStart = Date.parse(row.dimensions.datetimeHour)

      if (!Number.isFinite(periodStart)) {
        throw new Error('Cloudflare Analytics returned an invalid time bucket')
      }

      return {
        collectedAt,
        hostname: website.hostname,
        id: crypto.randomUUID(),
        pageViews: Math.max(0, Math.round(row.count)),
        periodEnd: periodStart + hourMilliseconds,
        periodStart,
        sampleInterval: Math.max(1, row.avg.sampleInterval),
        slug: website.slug,
        visits: Math.max(0, Math.round(row.sum.visits)),
      }
    }),
  )
}

export const syncCloudflareAnalytics = async (
  env: Bindings,
): Promise<number> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN

  if (!accountId && !apiToken) return 0

  if (!accountId || !apiToken) {
    throw new Error(
      'Cloudflare Analytics requires both CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN',
    )
  }

  const database = createDb(env.DB)
  const websites = await getAnalyticsWebsites(database)
  const end = Math.floor(Date.now() / hourMilliseconds) * hourMilliseconds
  const snapshots: WebsiteAnalyticsWrite[] = []

  for (let index = 0; index < websites.length; index += websitesPerRequest) {
    snapshots.push(
      ...(await fetchCloudflareAnalytics(
        accountId,
        apiToken,
        websites.slice(index, index + websitesPerRequest),
        end - collectionWindowMilliseconds,
        end,
      )),
    )
  }

  await upsertWebsiteAnalytics(database, snapshots)

  return snapshots.length
}

export const buildWebsiteAnalytics = async (
  env: Bindings,
  range: AnalyticsRange = '30d',
): Promise<WebsiteAnalytics> => {
  const rows = await getWebsiteAnalyticsSince(
    createDb(env.DB),
    Date.now() - getRangeMilliseconds(range),
  )

  const rowsBySlug = new Map<string, typeof rows>()

  for (const row of rows) {
    rowsBySlug.set(row.slug, [...(rowsBySlug.get(row.slug) ?? []), row])
  }

  const sites = [...rowsBySlug.entries()].map(([slug, siteRows]) => {
    const [firstRow] = siteRows
    const hostname = firstRow?.hostname ?? ''

    return {
      history: siteRows.map((row) => ({
        pageViews: row.pageViews,
        periodStart: new Date(row.periodStart).toISOString(),
        sampleInterval: row.sampleInterval,
        visits: row.visits,
      })),
      hostname,
      pageViews: siteRows.reduce((total, row) => total + row.pageViews, 0),
      slug,
      visits: siteRows.reduce((total, row) => total + row.visits, 0),
    }
  })

  return websiteAnalyticsSchema.parse({
    generatedAt: new Date().toISOString(),
    range,
    sites,
  })
}

export const cloudflareInternals = {
  buildQuery,
  fetchCloudflareAnalytics,
}
