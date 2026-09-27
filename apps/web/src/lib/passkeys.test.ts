import { describe, expect, test } from 'vitest'

import { normalizePasskeyError, PasskeyOperationError } from './passkeys'

describe('passkey error presentation', () => {
  test('keeps WebAuthn diagnostics out of user-facing copy', () => {
    const cause = new DOMException(
      'The operation either timed out or was not allowed. See the WebAuthn privacy considerations.',
      'NotAllowedError'
    )
    const error = Object.assign(new Error(cause.message), { cause })
    Object.assign(error, {
      code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
    })

    const normalized = normalizePasskeyError(error, 'authentication')

    expect(normalized).toBeInstanceOf(PasskeyOperationError)
    expect(normalized.code).toBe('passkey_cancelled_or_timed_out')
    expect(normalized.message).toBe(
      'We couldn’t sign you in. Try again and finish the confirmation on your device, or request a code by email.'
    )
    expect(normalized.message).not.toContain('w3.org')
    expect(normalized.diagnostic).toEqual({
      code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
      message: cause.message,
      name: 'NotAllowedError'
    })
  })

  test('uses registration-specific recovery guidance', () => {
    const error = new DOMException('The request timed out.', 'NotAllowedError')

    const normalized = normalizePasskeyError(error, 'registration')

    expect(normalized.message).toBe(
      'Your passkey wasn’t added. Try again and finish the confirmation on your device.'
    )
  })

  test('does not treat every wrapped browser failure as a cancellation', () => {
    const cause = new DOMException(
      'The authenticator could not process the request.',
      'UnknownError'
    )
    const error = Object.assign(new Error(cause.message), {
      cause,
      code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
    })

    const normalized = normalizePasskeyError(error, 'authentication')

    expect(normalized.code).toBe('passkey_operation_failed')
    expect(normalized.message).toBe(
      'We couldn’t sign you in. Try again or request a code by email.'
    )
  })

  test('separates site configuration failures from their technical cause', () => {
    const error = Object.assign(
      new Error('The RP ID is invalid for this domain'),
      {
        code: 'ERROR_INVALID_RP_ID'
      }
    )

    const normalized = normalizePasskeyError(error, 'authentication')

    expect(normalized.code).toBe('passkey_site_mismatch')
    expect(normalized.message).toBe(
      'Passkeys aren’t available right now. Request a code by email instead.'
    )
    expect(normalized.diagnostic.message).toBe(
      'The RP ID is invalid for this domain'
    )
  })

  test('uses registration-specific guidance for site configuration failures', () => {
    const error = new DOMException(
      'The RP ID is invalid for this domain',
      'SecurityError'
    )

    const normalized = normalizePasskeyError(error, 'registration')

    expect(normalized.code).toBe('passkey_site_mismatch')
    expect(normalized.message).toBe(
      'Passkeys can’t be added right now because this site’s passkey configuration is unavailable. Try again later.'
    )
    expect(normalized.message).not.toContain('email')
  })
})
