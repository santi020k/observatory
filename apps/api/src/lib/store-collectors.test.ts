import { describe, expect, test } from 'vitest'

import {
  isSupportedAppleReportName,
  selectLatestAppleInstancePoints
} from './apple-store'
import {
  decodeGoogleCsv,
  selectGoogleReportObjects,
  shouldIncludeGoogleOverall
} from './google-play'
import { parseStoreReport } from './store-reports'

describe('store collector report selection', () => {
  test('uses Apple standard reports and ignores detailed duplicates', () => {
    expect(isSupportedAppleReportName('App Downloads Standard')).toBe(true)
    expect(isSupportedAppleReportName(
      'App Store Installation and Deletion Standard'
    )).toBe(true)
    expect(isSupportedAppleReportName('App Crashes')).toBe(true)
    expect(isSupportedAppleReportName('App Downloads Detailed')).toBe(false)
    expect(isSupportedAppleReportName('App Store Purchases Standard')).toBe(false)
  })

  test('derives one overall Google series from canonical dimensions', () => {
    expect(shouldIncludeGoogleOverall(
      'stats/installs/installs_com.example_202609_country.csv'
    )).toBe(true)
    expect(shouldIncludeGoogleOverall(
      'stats/installs/installs_com.example_202609_device.csv'
    )).toBe(false)
    expect(shouldIncludeGoogleOverall(
      'stats/crashes/crashes_com.example_202609_app_version.csv'
    )).toBe(true)
    expect(shouldIncludeGoogleOverall(
      'stats/crashes/crashes_com.example_202609_os_version.csv'
    )).toBe(false)
  })

  test('replaces overlapping Apple dates with the newest instance', () => {
    const createInstance = (counts: number) => parseStoreReport({
      appSlug: 'postlens',
      collectedAt: Date.UTC(2026, 8, 24),
      delimiter: '\t',
      provider: 'apple',
      source: 'App Downloads Standard',
      text: [
        'Date\tDevice\tDownload Type\tCounts',
        `2026-09-22\tiPhone\tFirst-time download\t${counts}`
      ].join('\n')
    })

    const points = selectLatestAppleInstancePoints([
      createInstance(3),
      createInstance(5)
    ])
    const total = points.find(point => point.dimension === 'overall' &&
      point.metric === 'totalDownloads')

    expect(total?.value).toBe(5)
  })

  test('bounds Google downloads while rotating historical months', () => {
    const now = Date.UTC(2026, 8, 27)
    const dimensions = ['app_version', 'carrier', 'country', 'device', 'os_version']
    const objects = Array.from({ length: 13 }, (_, offset) => {
      const month = new Date(Date.UTC(2026, 8 - offset, 1))
      const period = `${month.getUTCFullYear()}${String(
        month.getUTCMonth() + 1
      ).padStart(2, '0')}`

      return dimensions.map(dimension => ({
        name: `stats/installs/installs_com.example_${period}_${dimension}.csv`
      }))
    }).flat()

    const selected = selectGoogleReportObjects(
      objects,
      Date.UTC(2025, 8, 26),
      now
    )
    const selectedMonths = new Set(selected.map(object => /_(\d{6})_/u
      .exec(object.name)?.[1]))

    expect(selected).toHaveLength(12)
    expect(selectedMonths.size).toBe(3)
    expect(selectedMonths).toContain('202509')
    expect(selected.some(object => object.name.includes('_carrier.csv')))
      .toBe(false)
  })

  test('decodes Google UTF-16 exports without a byte-order marker', () => {
    const text = 'Date,Daily Crashes\n2026-09-24,2'
    const bytes = new Uint8Array(text.length * 2)

    for (let index = 0; index < text.length; index += 1) {
      bytes[index * 2] = text.codePointAt(index) ?? 0
      bytes[index * 2 + 1] = 0
    }

    expect(decodeGoogleCsv(bytes)).toBe(text)
  })
})
