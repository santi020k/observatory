import type {
  StoreMetricName,
  StoreMetricTotals
} from '@santi020k/observatory-api-types'
import type {
  StoreMetricDimension,
  StoreMetricProvider,
  StoreMetricWrite
} from '@santi020k/observatory-db'

const metricColumns = {
  activeDevices: ['Active Devices'],
  anrs: ['Daily ANRs', 'ANRs'],
  crashes: ['Daily Crashes', 'Crashes'],
  currentDeviceInstalls: ['Installs on active devices', 'Current Device Installs'],
  currentUserInstalls: ['Current User Installs'],
  dailyDeviceInstalls: ['Daily Device Installs'],
  dailyDeviceUninstalls: ['Daily Device Uninstalls'],
  dailyDeviceUpgrades: ['Daily Device Upgrades'],
  dailyUserInstalls: ['Daily User Installs'],
  dailyUserUninstalls: ['Daily User Uninstalls'],
  deletions: ['Deletions'],
  firstTimeDownloads: ['First Time Downloads', 'First-Time Downloads'],
  installations: ['Installations'],
  redownloads: ['Redownloads'],
  sessions: ['Sessions'],
  totalDownloads: ['Total Downloads'],
  totalUserInstalls: ['Total User Installs']
} as const satisfies Record<StoreMetricName, readonly string[]>

const dimensionColumns = {
  appVersion: ['App Version', 'App Version Code'],
  country: ['Territory', 'Country/region', 'Country'],
  device: ['Device'],
  osVersion: ['Platform Version', 'Android OS Version']
} as const satisfies Record<
  Exclude<StoreMetricDimension, 'overall'>,
  readonly string[]
>

const normalizeHeader = (value: string): string => value
  .trim()
  .toLocaleLowerCase('en')
  .replaceAll(/[^a-z0-9]+/gu, '')

const parseNumber = (value: string | undefined): number | null => {
  if (!value) return null

  const parsed = Number(value.replaceAll(',', '').trim())

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const toPeriodStart = (value: string | undefined): number | null => {
  if (!value) return null

  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value.trim()) ?
    new Date(`${value.trim()}T00:00:00.000Z`) :
    new Date(value)

  return Number.isFinite(date.getTime()) ?
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    ) :
    null
}

interface DelimitedParserState {
  field: string
  quoted: boolean
  row: string[]
  rows: string[][]
}

const pushField = (state: DelimitedParserState): void => {
  state.row.push(state.field)

  state.field = ''
}

const consumeQuote = (
  input: string,
  index: number,
  state: DelimitedParserState
): number | null => {
  if (input[index] !== '"') return null

  if (state.quoted && input[index + 1] === '"') {
    state.field += '"'

    return index + 1
  }

  state.quoted = !state.quoted

  return index
}

const consumeBoundary = (
  input: string,
  index: number,
  character: string,
  delimiter: ',' | '\t',
  state: DelimitedParserState
): boolean => {
  if (state.quoted) return false

  if (character === delimiter) {
    pushField(state)

    return true
  }

  if (character !== '\n' && character !== '\r') return false

  pushField(state)

  if (state.row.some(value => value.length > 0)) state.rows.push(state.row)

  state.row = []

  return input[index] !== undefined
}

export const parseDelimited = (
  input: string,
  delimiter: ',' | '\t'
): string[][] => {
  const state: DelimitedParserState = {
    field: '',
    quoted: false,
    row: [],
    rows: []
  }

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? ''
    const consumedQuoteAt = consumeQuote(input, index, state)

    if (consumedQuoteAt !== null) {
      index = consumedQuoteAt

      continue
    }

    if (consumeBoundary(input, index, character, delimiter, state)) {
      if (character === '\r' && input[index + 1] === '\n') index += 1

      continue
    }

    state.field += character
  }

  pushField(state)

  if (state.row.some(value => value.length > 0)) state.rows.push(state.row)

  return state.rows
}

const getColumn = (
  row: ReadonlyMap<string, string>,
  candidates: readonly string[]
): string | undefined => {
  for (const candidate of candidates) {
    const value = row.get(normalizeHeader(candidate))

    if (value !== undefined) return value
  }

  return undefined
}

const addAppleDownloadMetric = (
  row: ReadonlyMap<string, string>,
  metrics: StoreMetricTotals
): void => {
  const downloads = parseNumber(getColumn(row, ['Counts', 'Downloads']))

  if (downloads === null) return

  const downloadType = getColumn(row, ['Download Type'])
    ?.toLocaleLowerCase('en')

  if (downloadType?.includes('first')) metrics.firstTimeDownloads = downloads
  else if (downloadType?.includes('redownload')) metrics.redownloads = downloads
  else if (!downloadType) metrics.totalDownloads = downloads
}

const addAppleInstallationMetric = (
  row: ReadonlyMap<string, string>,
  metrics: StoreMetricTotals
): void => {
  const counts = parseNumber(getColumn(row, ['Counts']))

  if (counts === null) return

  const event = getColumn(row, ['Event'])?.toLocaleLowerCase('en')

  if (event === 'install') metrics.installations = counts
  else if (event === 'delete') metrics.deletions = counts
}

const isAppleReport = (source: string, reportName: string): boolean => source === reportName || source === `${reportName} Standard`

const getMetrics = (
  row: ReadonlyMap<string, string>,
  provider: StoreMetricProvider,
  source: string
): StoreMetricTotals => {
  const metrics: StoreMetricTotals = {}

  for (const [metric, columns] of Object.entries(metricColumns) as [
    StoreMetricName,
    readonly string[]
  ][]) {
    const value = parseNumber(getColumn(row, columns))

    if (value !== null) metrics[metric] = value
  }

  if (provider === 'apple') {
    if (isAppleReport(source, 'App Store Downloads'))
      addAppleDownloadMetric(row, metrics)

    if (isAppleReport(source, 'App Store Installations and Deletions'))
      addAppleInstallationMetric(row, metrics)
  }

  return metrics
}

interface AggregatedFact {
  appSlug: string
  collectedAt: number
  dimension: StoreMetricDimension
  dimensionValue: string
  metric: StoreMetricName
  periodStart: number
  provider: StoreMetricProvider
  source: string
  value: number
}

interface FactIdentity {
  appSlug: string
  dimension: StoreMetricDimension
  dimensionValue: string
  metric: string
  periodStart: number
  provider: StoreMetricProvider
}

const factKey = (fact: FactIdentity): string => [
  fact.appSlug,
  fact.provider,
  fact.periodStart,
  fact.metric,
  fact.dimension,
  fact.dimensionValue
].join('\0')

const addFact = (
  facts: Map<string, AggregatedFact>,
  fact: AggregatedFact
): void => {
  const key = factKey(fact)
  const current = facts.get(key)

  facts.set(key, {
    ...fact,
    value: (current?.value ?? 0) + fact.value
  })
}

const addDerivedTotalDownloads = (
  facts: Map<string, AggregatedFact>
): void => {
  const additions: AggregatedFact[] = []

  for (const fact of facts.values()) {
    if (
      fact.metric !== 'firstTimeDownloads' &&
      fact.metric !== 'redownloads'
    ) continue

    const totalFact = { ...fact, metric: 'totalDownloads' as const }
    const totalKey = factKey(totalFact)

    if (facts.has(totalKey)) continue

    const existing = additions.find(candidate => factKey(candidate) === totalKey)

    if (existing) existing.value += fact.value
    else additions.push(totalFact)
  }

  for (const fact of additions) facts.set(factKey(fact), fact)
}

export interface StoreReportInput {
  appSlug: string
  collectedAt: number
  delimiter: ',' | '\t'
  includeOverall?: boolean
  provider: StoreMetricProvider
  source: string
  text: string
}

const getDimensions = (
  row: ReadonlyMap<string, string>,
  includeOverall: boolean
): [StoreMetricDimension, string][] => {
  const dimensions: [StoreMetricDimension, string][] = includeOverall ?
    [['overall', 'all']] :
    []

  for (const [dimension, candidates] of Object.entries(
    dimensionColumns
  ) as [Exclude<StoreMetricDimension, 'overall'>, readonly string[]][]) {
    const value = getColumn(row, candidates)?.trim()

    if (value) dimensions.push([dimension, value])
  }

  return dimensions
}

interface AddRowFactsInput {
  appSlug: string
  collectedAt: number
  dimensions: readonly [StoreMetricDimension, string][]
  facts: Map<string, AggregatedFact>
  metrics: StoreMetricTotals
  periodStart: number
  provider: StoreMetricProvider
  source: string
}

const addRowFacts = ({
  appSlug,
  collectedAt,
  dimensions,
  facts,
  metrics,
  periodStart,
  provider,
  source
}: AddRowFactsInput): void => {
  for (const [metric, value] of Object.entries(metrics) as [
    StoreMetricName,
    number
  ][])
    for (const [dimension, dimensionValue] of dimensions)
      addFact(facts, {
        appSlug,
        collectedAt,
        dimension,
        dimensionValue,
        metric,
        periodStart,
        provider,
        source,
        value
      })
}

export const parseStoreReport = ({
  appSlug,
  collectedAt,
  delimiter,
  includeOverall = true,
  provider,
  source,
  text
}: StoreReportInput): StoreMetricWrite[] => {
  const [headerRow, ...dataRows] = parseDelimited(text, delimiter)

  if (!headerRow) return []

  const headers = headerRow.map(normalizeHeader)
  const facts = new Map<string, AggregatedFact>()

  for (const values of dataRows) {
    const row = new Map(
      headers.map((header, index) => [header, values[index]?.trim() ?? ''])
    )

    const periodStart = toPeriodStart(getColumn(row, ['Date']))

    if (periodStart === null) continue

    const metrics = getMetrics(row, provider, source)

    addRowFacts({
      appSlug,
      collectedAt,
      dimensions: getDimensions(row, includeOverall),
      facts,
      metrics,
      periodStart,
      provider,
      source
    })
  }

  if (provider === 'apple') addDerivedTotalDownloads(facts)

  return [...facts.values()].map(fact => ({
    ...fact,
    id: crypto.randomUUID()
  }))
}

export const mergeStoreMetricPoints = (
  pointGroups: readonly (readonly StoreMetricWrite[])[]
): StoreMetricWrite[] => {
  const merged = new Map<string, StoreMetricWrite>()

  for (const point of pointGroups.flat()) {
    const key = factKey(point)
    const current = merged.get(key)

    merged.set(key, {
      ...point,
      id: current?.id ?? point.id,
      value: (current?.value ?? 0) + point.value
    })
  }

  return [...merged.values()]
}
