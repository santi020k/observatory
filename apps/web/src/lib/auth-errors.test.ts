import { describe, expect, test } from 'vitest'

import { normalizePasskeyError, PasskeyOperationError } from './auth-errors'

describe('passkey error presentation', () => {
  test('keeps published-client WebAuthn diagnostics out of user-facing copy', () => {
    const error = {
      code: 'auth_request_failed',
      message:
        'The operation either timed out or was not allowed. See https://www.w3.org/TR/webauthn-3/#sctn-privacy-considerations-client.',
      status: null
    }

    const normalized = normalizePasskeyError(error, 'authentication')

    expect(normalized).toBeInstanceOf(PasskeyOperationError)
    expect(normalized.code).toBe('passkey_cancelled_or_timed_out')
    expect(normalized.message).toBe(
      'We couldn’t sign you in. Try again and finish the confirmation on your device, or use the code sent to your email.'
    )
    expect(normalized.message).not.toContain('w3.org')
    expect(normalized.diagnostic).toEqual({
      code: 'auth_request_failed',
      message: error.message,
      name: null,
      status: null
    })
  })

  test('uses registration-specific recovery guidance', () => {
    const normalized = normalizePasskeyError(
      new DOMException('The request timed out.', 'NotAllowedError'),
      'registration'
    )

    expect(normalized.message).toBe(
      'Your passkey wasn’t added. Try again and finish the confirmation on your device.'
    )
  })

  test('separates site configuration failures from their technical cause', () => {
    const error = {
      code: 'error_invalid_rp_id',
      message: 'The RP ID is invalid for this domain',
      status: 400
    }

    const normalized = normalizePasskeyError(error, 'authentication')

    expect(normalized.code).toBe('passkey_site_mismatch')
    expect(normalized.message).toBe(
      'Passkeys aren’t available right now. Use the code sent to your email instead.'
    )
    expect(normalized.diagnostic).toEqual({
      code: 'error_invalid_rp_id',
      message: error.message,
      name: null,
      status: 400
    })
  })

  test('uses safe fallback copy for unknown package failures', () => {
    const normalized = normalizePasskeyError(
      new Error('Internal authenticator transport details'),
      'authentication'
    )

    expect(normalized.code).toBe('passkey_operation_failed')
    expect(normalized.message).toBe(
      'We couldn’t sign you in. Try again or use the code sent to your email.'
    )
    expect(normalized.diagnostic.message).toBe(
      'Internal authenticator transport details'
    )
  })
})
