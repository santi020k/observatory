import { describe, expect, test } from 'vitest'

import { formatDuration, formatNumber } from './format'

describe('dashboard formatting', () => {
  test('distinguishes unavailable private GitHub traffic', () => {
    expect(formatNumber(null)).toBe('Connect GitHub')
  })

  test('formats response timings', () => {
    expect(formatDuration(237)).toBe('237 ms')

    expect(formatDuration(null)).toBe('Not checked')
  })
})
