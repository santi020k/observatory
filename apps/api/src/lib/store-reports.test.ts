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
      source: 'App Store Downloads',
      text: [
        'Date\tDevice\tApp Version\tDownload Type\tDownloads',
        '2026-09-22\tiPhone\t2.0.0\tFirst-time download\t3',
        '2026-09-22\tiPhone\t2.0.0\tRedownload\t1'
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

  test('keeps Google active installs separate from install events', () => {
    const points = parseStoreReport({
      appSlug: 'betweencontractions',
      collectedAt: Date.UTC(2026, 8, 23),
      delimiter: ',',
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
      }),
      expect.objectContaining({
        dimension: 'overall',
        metric: 'dailyDeviceInstalls',
        value: 2
      })
    ]))
  })
})
