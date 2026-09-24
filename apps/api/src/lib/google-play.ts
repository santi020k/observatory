import type { PublishedApp } from '@santi020k/observatory-catalog'
import type { StoreMetricWrite } from '@santi020k/observatory-db'

import type { Bindings } from '../env'

import {
  createGoogleServiceAccountAssertion,
  type GoogleServiceAccount,
  parseGoogleServiceAccount } from './provider-auth'
import { mergeStoreMetricPoints, parseStoreReport } from './store-reports'

interface GoogleTokenResponse {
  access_token?: string
}

interface GoogleStorageObject {
  name: string
}

interface GoogleStorageListResponse {
  items?: GoogleStorageObject[]
  nextPageToken?: string
}

const storageScope = 'https://www.googleapis.com/auth/devstorage.read_only'
const requestTimeoutMilliseconds = 20_000
const dimensionSuffixPattern = /_(?:app_version|carrier|country|device|language|os_version)\.csv$/u

type Fetcher = (
  input: Request | string | URL,
  init?: RequestInit
) => Promise<Response>

export interface GooglePlayConfiguration {
  account: GoogleServiceAccount
  bucket: string
}

export const readGooglePlayConfiguration = (
  env: Bindings
): GooglePlayConfiguration | null => {
  if (!env.GOOGLE_PLAY_REPORT_BUCKET || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
    return null

  return {
    account: parseGoogleServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
    bucket: env.GOOGLE_PLAY_REPORT_BUCKET.replace(/^gs:\/\//u, '').replace(/\/$/u, '')
  }
}

const getAccessToken = async (
  configuration: GooglePlayConfiguration,
  fetcher: Fetcher,
  now: number
): Promise<string> => {
  const assertion = await createGoogleServiceAccountAssertion(
    configuration.account,
    storageScope,
    now
  )

  const body = new URLSearchParams({
    assertion,
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer'
  })

  const response = await fetcher(configuration.account.tokenUri, {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    signal: AbortSignal.timeout(requestTimeoutMilliseconds)
  })

  if (!response.ok)
    throw new Error(`Google OAuth request failed with ${response.status}.`)

  const token = await response.json<GoogleTokenResponse>()

  if (!token.access_token)
    throw new Error('Google OAuth response did not include an access token.')

  return token.access_token
}

const listObjects = async (
  bucket: string,
  prefix: string,
  token: string,
  fetcher: Fetcher
): Promise<GoogleStorageObject[]> => {
  const objects: GoogleStorageObject[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`
    )

    url.searchParams.set('prefix', prefix)

    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(requestTimeoutMilliseconds)
    })

    if (!response.ok)
      throw new Error(`Google report listing failed with ${response.status}.`)

    const result = await response.json<GoogleStorageListResponse>()

    objects.push(...(result.items ?? []))

    pageToken = result.nextPageToken
  } while (pageToken)

  return objects
}

const decodeGoogleCsv = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))

  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))

  return new TextDecoder().decode(bytes)
}

const getReportMonth = (name: string): number | null => {
  const match = /_(\d{4})(\d{2})_/u.exec(name)

  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])

  return month >= 1 && month <= 12 ? Date.UTC(year, month - 1, 1) : null
}

const downloadObject = async (
  bucket: string,
  name: string,
  token: string,
  fetcher: Fetcher
): Promise<string> => {
  const response = await fetcher(
    `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(requestTimeoutMilliseconds)
    }
  )

  if (!response.ok)
    throw new Error(`Google report download failed with ${response.status}.`)

  return decodeGoogleCsv(new Uint8Array(await response.arrayBuffer()))
}

export const collectGooglePlayMetrics = async (
  app: PublishedApp,
  configuration: GooglePlayConfiguration,
  options: {
    fetcher?: Fetcher
    now?: number
    since: number
  }
): Promise<StoreMetricWrite[]> => {
  if (!app.google) return []

  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()
  const token = await getAccessToken(configuration, fetcher, now)
  const packageName = app.google.packageName

  const prefixes = [
    `stats/installs/installs_${packageName}_`,
    `stats/crashes/crashes_${packageName}_`
  ]

  const objectGroups = await Promise.all(
    prefixes.map(prefix => listObjects(
      configuration.bucket,
      prefix,
      token,
      fetcher
    ))
  )

  const objects = objectGroups
    .flat()
    .filter(object => object.name.endsWith('.csv'))
    .filter(object => {
      const month = getReportMonth(object.name)
      const sinceDate = new Date(options.since)

      const sinceMonth = Date.UTC(
        sinceDate.getUTCFullYear(),
        sinceDate.getUTCMonth(),
        1
      )

      return month === null || month >= sinceMonth
    })

  const groups: StoreMetricWrite[][] = []

  for (const object of objects) {
    const text = await downloadObject(
      configuration.bucket,
      object.name,
      token,
      fetcher
    )

    groups.push(parseStoreReport({
      appSlug: app.slug,
      collectedAt: now,
      delimiter: ',',
      includeOverall: !dimensionSuffixPattern.test(object.name),
      provider: 'google',
      source: object.name,
      text
    }))
  }

  return mergeStoreMetricPoints(groups)
}
