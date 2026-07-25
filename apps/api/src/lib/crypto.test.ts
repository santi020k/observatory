import { describe, expect, it } from 'vitest'

import { hashValue, safeEqual } from './crypto'

describe('authentication crypto', () => {
  it('creates deterministic secret-scoped hashes', async () => {
    const first = await hashValue('secret', '123456')
    const second = await hashValue('secret', '123456')
    const other = await hashValue('other-secret', '123456')

    expect(first).toBe(second)

    expect(first).not.toBe(other)
  })

  it('compares equal-length hashes without early exits', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)

    expect(safeEqual('abc', 'abd')).toBe(false)

    expect(safeEqual('abc', 'ab')).toBe(false)
  })
})
