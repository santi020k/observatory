import type {
  StoreMetricName,
  StoreMetricTotals,
  StoreProvider
} from '@santi020k/observatory-api-types'

export const providerLabels: Record<StoreProvider, string> = {
  apple: 'App Store',
  google: 'Google Play'
}

export const statusMeta = {
  available: { label: 'Reporting', variant: 'success' },
  awaiting_data: { label: 'Awaiting reports', variant: 'warning' },
  failed: { label: 'Sync needs attention', variant: 'destructive' },
  not_configured: { label: 'Connect reporting', variant: 'outline' }
} as const

export const metricLabels: Record<StoreMetricName, string> = {
  activeDevices: 'Active devices',
  anrs: 'ANRs',
  crashes: 'Crashes',
  currentDeviceInstalls: 'Active install base',
  currentUserInstalls: 'Current user installs',
  dailyDeviceInstalls: 'Device installs',
  dailyDeviceUninstalls: 'Device uninstalls',
  dailyDeviceUpgrades: 'Device upgrades',
  dailyUserInstalls: 'User installs',
  dailyUserUninstalls: 'User uninstalls',
  deletions: 'Deletions',
  firstTimeDownloads: 'First-time downloads',
  installations: 'Installations',
  redownloads: 'Redownloads',
  sessions: 'Sessions',
  totalDownloads: 'Total downloads',
  totalUserInstalls: 'Total user installs'
}

export const providerMetricOrder: Record<
  StoreProvider,
  readonly StoreMetricName[]
> = {
  apple: [
    'totalDownloads',
    'installations',
    'activeDevices',
    'deletions',
    'sessions',
    'crashes'
  ],
  google: [
    'currentDeviceInstalls',
    'dailyDeviceInstalls',
    'dailyDeviceUninstalls',
    'dailyDeviceUpgrades',
    'crashes',
    'anrs'
  ]
}

const stockMetrics = new Set<StoreMetricName>([
  'activeDevices',
  'currentDeviceInstalls',
  'currentUserInstalls',
  'totalUserInstalls'
])

export const metricContext = (
  metric: StoreMetricName,
  provider: StoreProvider,
  rangeLabel: string
): string => stockMetrics.has(metric) ?
  `Latest reported · ${rangeLabel}` :
  `${providerLabels[provider]} total · ${rangeLabel}`

export const primaryMetric = (
  provider: StoreProvider,
  metrics: StoreMetricTotals
): StoreMetricName | undefined => providerMetricOrder[provider].find(metric => metrics[metric] !== undefined)

export const emptyStatusMessage = (
  status: keyof typeof statusMeta,
  provider: StoreProvider
): string => {
  if (status === 'not_configured')
    return provider === 'google' ?
      'The public listing is live. Connect the read-only Play reporting bucket to collect installs and quality signals.' :
      'Connect the provider’s read-only reporting credentials to begin daily collection.'

  if (status === 'failed')
    return 'The latest provider request failed. Existing snapshots remain intact while access is checked.'

  return provider === 'apple' ?
    'The listing is live, but Apple has not issued a daily analytics report for this app yet. Low-volume rows can be withheld for privacy.' :
    'The listing is live and reporting is connected, but no aggregate rows are available for this range yet.'
}

export const metricIcon = (
  metric: StoreMetricName
):
  | 'activity' |
  'circle-dot-dashed' |
  'download' |
  'history' |
  'monitor' |
  'users' => {
  if (
    [
      'totalDownloads',
      'firstTimeDownloads',
      'redownloads',
      'dailyDeviceInstalls'
    ].includes(metric)
  )
    return 'download'

  if (metric === 'currentDeviceInstalls' || metric === 'installations')
    return 'monitor'

  if (metric === 'activeDevices' || metric === 'sessions') return 'users'

  if (metric === 'crashes' || metric === 'anrs') return 'circle-dot-dashed'

  if (metric.includes('Uninstall') || metric === 'deletions') return 'history'

  return 'activity'
}

export const dimensionLabels = {
  appVersion: 'App version',
  country: 'Country or territory',
  device: 'Device',
  osVersion: 'Operating system'
} as const

export const primaryBreakdownMetric = (
  provider: StoreProvider,
  metrics: StoreMetricTotals
): StoreMetricName => {
  const candidates: readonly StoreMetricName[] =
    provider === 'apple' ?
      ['installations', 'totalDownloads', 'activeDevices'] :
      ['currentDeviceInstalls', 'dailyDeviceInstalls', 'dailyUserInstalls']

  return (
    candidates.find(metric => metrics[metric] !== undefined) ??
    (provider === 'apple' ? 'installations' : 'currentDeviceInstalls')
  )
}
