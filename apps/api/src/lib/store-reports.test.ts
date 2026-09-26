import { describe, expect, test } from 'vitest'

import { parseDelimited, parseStoreReport } from './store-reports'

describe('store report parsing', () => {
  test('parses quoted CSV fields without splitting embedded delimiters', () => {
    expect(parseDelimited('Date,Device\n2026-09-22,"Pixel, Pro"\n', ','))
      .toEqual([
        ['Date', 'Device'],
        ['2026-09-22', 'Pixel, Pro']
      ])
  })

  test('normalizes Apple downloads into totals and aggregate devices', () => {
    const points = parseStoreReport({
      appSlug: 'postlens',
      collectedAt: Date.UTC(2026, 8, 23),
      delimiter: '\t',
      provider: 'apple',
      source: 'App Downloads Standard',
      text: [
        'Date\tDevice\tApp Version\tDownload Type\tCounts',
        '2026-09-22\tiPhone\t2.0.0\tFirst-time download\t3',
        '2026-09-22\tiPhone\t2.0.0\tRedownload\t1',
        '2026-09-22\tiPhone\t2.0.0\tManual update\t9'
      ].join('\n')
    })

    expect(points).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'overall',
        metric: 'totalDownloads',
        value: 4
      }),
      expect.objectContaining({
        dimension: 'device',
        dimensionValue: 'iPhone',
        metric: 'firstTimeDownloads',
        value: 3
      })
    ]))
  })

  test('maps Apple installation events without duplicating downloads', () => {
    const points = parseStoreReport({
      appSlug: 'postlens',
      collectedAt: Date.UTC(2026, 8, 23),
      delimiter: '\t',
      provider: 'apple',
      source: 'App Store Installation and Deletion Standard',
      text: [
        'Date\tDevice\tEvent\tDownload Type\tCounts\tUnique Devices',
        '2026-09-22\tiPhone\tInstall\tFirst-time download\t3\t3',
        '2026-09-22\tiPhone\tDelete\tFirst-time download\t1\t1'
      ].join('\n')
    })

    expect(points).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'overall',
        metric: 'installations',
        value: 3
      }),
      expect.objectContaining({
        dimension: 'device',
        metric: 'deletions',
        value: 1
      })
    ]))
    expect(points.some(point => point.metric === 'totalDownloads')).toBe(false)
  })

  test('keeps Google active installs separate from install events', () => {
    const points = parseStoreReport({
      appSlug: 'betweencontractions',
      collectedAt: Date.UTC(2026, 8, 23),
      delimiter: ',',
      includeOverall: false,
      provider: 'google',
      source: 'installs_device.csv',
      text: [
        'Date,Package Name,Device,Installs on active devices,Daily Device Installs,Daily Device Uninstalls',
        '2026-09-22,com.santi020k.betweencontractions,Pixel 10,8,2,1'
      ].join('\n')
    })

    expect(points).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: 'device',
        metric: 'currentDeviceInstalls',
        value: 8
      })
    ]))
    expect(points.some(point => point.dimension === 'overall')).toBe(false)
  })

  test('parses Apple session and crash report metrics', () => {
    const sessions = parseStoreReport({
      appSlug: 'lumen',
      collectedAt: Date.UTC(2026, 8, 24),
      delimiter: '\t',
      provider: 'apple',
      source: 'App Sessions Standard',
      text: [
        'Date\tDevice\tPlatform Version\tSessions\tUnique Devices',
        '2026-09-23\tiPhone\tiOS 26.0\t12\t5'
      ].join('\n')
    })
    const crashes = parseStoreReport({
      appSlug: 'lumen',
      collectedAt: Date.UTC(2026, 8, 24),
      delimiter: '\t',
      provider: 'apple',
      source: 'App Crashes',
      text: [
        'Date\tApp Version\tDevice\tPlatform Version\tCrashes\tUnique Devices',
        '2026-09-23\t1.0.0\tiPhone\tiOS 26.0\t2\t1'
      ].join('\n')
    })

    expect(sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'sessions', value: 12 })
    ]))
    expect(crashes).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'crashes', value: 2 })
    ]))
    expect([...sessions, ...crashes].some(
      point => point.metric === 'activeDevices'
    )).toBe(false)
  })
})
