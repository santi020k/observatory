export type PasskeyOperation = 'authentication' | 'registration'

export interface PasskeyErrorDiagnostic {
  code: string | null
  message: string
  name: string | null
  status: number | null
}

/** UI-safe passkey failure with technical details kept out of rendered copy. */
export class PasskeyOperationError extends Error {
  readonly code: string
  readonly diagnostic: PasskeyErrorDiagnostic
  readonly originalError: unknown

  constructor(
    code: string,
    message: string,
    diagnostic: PasskeyErrorDiagnostic,
    originalError: unknown
  ) {
    super(message)

    this.code = code

    this.diagnostic = diagnostic

    this.name = 'PasskeyOperationError'

    this.originalError = originalError
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const errorText = (
  value: unknown,
  key: 'code' | 'message' | 'name'
): string | null => {
  if (!isRecord(value)) return null

  const text = value[key]

  return typeof text === 'string' && text.trim() ? text : null
}

const errorStatus = (value: unknown): number | null => {
  if (!isRecord(value)) return null

  const status = value.status

  return typeof status === 'number' && Number.isFinite(status) ? status : null
}

const passkeyDiagnostic = (error: unknown): PasskeyErrorDiagnostic => {
  const cause = isRecord(error) ? error.cause : undefined

  return {
    code: errorText(error, 'code') ?? errorText(cause, 'code'),
    message:
      errorText(cause, 'message') ??
      errorText(error, 'message') ??
      'Unknown passkey error',
    name: errorText(cause, 'name') ?? errorText(error, 'name'),
    status: errorStatus(error) ?? errorStatus(cause)
  }
}

const matchesDiagnostic = (
  diagnostic: PasskeyErrorDiagnostic,
  names: readonly string[],
  codes: readonly string[],
  messagePattern: RegExp
): boolean => names.includes(diagnostic.name ?? '') ||
  codes.includes(diagnostic.code ?? '') ||
  messagePattern.test(diagnostic.message)

const cancelledMessage = (operation: PasskeyOperation): string => operation === 'registration' ?
  'Your passkey wasn’t added. Try again and finish the confirmation on your device.' :
  'We couldn’t sign you in. Try again and finish the confirmation on your device, or use the code sent to your email.'

const fallbackMessage = (operation: PasskeyOperation): string => operation === 'registration' ?
  'Your passkey wasn’t added. Try again or use a different device.' :
  'We couldn’t sign you in. Try again or use the code sent to your email.'

export const normalizePasskeyError = (
  error: unknown,
  operation: PasskeyOperation
): PasskeyOperationError => {
  const diagnostic = passkeyDiagnostic(error)

  if (
    matchesDiagnostic(
      diagnostic,
      ['NotAllowedError'],
      [
        'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        'error_passthrough_see_cause_property'
      ],
      /cancel(?:led|ed)|not allowed|timed out/iu
    )
  ) {
    return new PasskeyOperationError(
      'passkey_cancelled_or_timed_out',
      cancelledMessage(operation),
      diagnostic,
      error
    )
  }

  if (
    matchesDiagnostic(
      diagnostic,
      ['SecurityError'],
      [
        'ERROR_INVALID_DOMAIN',
        'ERROR_INVALID_RP_ID',
        'error_invalid_domain',
        'error_invalid_rp_id'
      ],
      /domain|relying party|rp id/iu
    )
  ) {
    return new PasskeyOperationError(
      'passkey_site_mismatch',
      'Passkeys aren’t available right now. Use the code sent to your email instead.',
      diagnostic,
      error
    )
  }

  return new PasskeyOperationError(
    'passkey_operation_failed',
    fallbackMessage(operation),
    diagnostic,
    error
  )
}
