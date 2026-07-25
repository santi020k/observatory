import { describe, expect, it } from 'vitest'

import { requestCodeSchema, verifyCodeSchema } from './index'

describe('authentication contracts', () => {
  it('normalizes owner email addresses', () => {
    expect(requestCodeSchema.parse({ email: ' SANTI@EXAMPLE.COM ' })).toEqual({
      email: 'santi@example.com',
    })
  })

  it('only accepts six digit verification codes', () => {
    expect(
      verifyCodeSchema.safeParse({ code: '123456', email: 'santi@example.com' })
        .success,
    ).toBe(true)

    expect(
      verifyCodeSchema.safeParse({ code: '12345a', email: 'santi@example.com' })
        .success,
    ).toBe(false)
  })
})
