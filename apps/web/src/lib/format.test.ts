import { describe, expect, it } from 'vitest'

import { formatDuration, formatNumber } from './format'

describe('dashboard formatting', () => {
  it('distinguishes unavailable private GitHub traffic', () => {
    expect(formatNumber(null)).toBe('Connect GitHub')
  })

  it('formats response timings', () => {
    expect(formatDuration(237)).toBe('237 ms')

    expect(formatDuration(null)).toBe('Not checked')
  })
})
