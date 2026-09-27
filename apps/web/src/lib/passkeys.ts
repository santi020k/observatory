import type { PasskeyCredential } from '@santi020k/observatory-api-types'
import {
  passkeyCredentialSchema,
  passkeyCredentialsSchema
} from '@santi020k/observatory-api-types'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/browser'
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration
} from '@simplewebauthn/browser'

interface AuthenticationOptionsEnvelope {
  challengeId: string
  options: PublicKeyCredentialRequestOptionsJSON
}

interface RegistrationOptionsEnvelope {
  challengeId: string
  options: PublicKeyCredentialCreationOptionsJSON
}

type PasskeyOperation = 'authentication' | 'registration'

export interface PasskeyErrorDiagnostic {
  code: string | null
  message: string
  name: string | null
}

/** UI-safe passkey failure with technical details kept in separate developer-only fields. */
export class PasskeyOperationError extends Error {
  readonly code: string
  readonly diagnostic: PasskeyErrorDiagnostic
  readonly originalError: unknown

  constructor(
    code: string,
    message: string,
    diagnostic: PasskeyErrorDiagnostic,
    cause: unknown
  ) {
    super(message)

    this.code = code

    this.diagnostic = diagnostic

    this.name = 'PasskeyOperationError'

    this.originalError = cause
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

const passkeyDiagnostic = (error: unknown): PasskeyErrorDiagnostic => {
  const cause = isRecord(error) ? error.cause : undefined

  return {
    code: errorText(error, 'code') ?? errorText(cause, 'code'),
    message:
      errorText(cause, 'message') ??
      errorText(error, 'message') ??
      'Unknown passkey error',
    name: errorText(cause, 'name') ?? errorText(error, 'name')
  }
}

const matchesDiagnostic = (
  diagnostic: PasskeyErrorDiagnostic,
  names: readonly string[],
  codes: readonly string[]
): boolean => names.includes(diagnostic.name ?? '') ||
  codes.includes(diagnostic.code ?? '')

const cancelledMessage = (operation: PasskeyOperation): string => operation === 'registration' ?
  'Your passkey wasn’t added. Try again and finish the confirmation on your device.' :
  'We couldn’t sign you in. Try again and finish the confirmation on your device, or use the code sent to your email.'

const fallbackMessage = (operation: PasskeyOperation): string => operation === 'registration' ?
  'Your passkey wasn’t added. Try again or use a different device.' :
  'We couldn’t sign you in. Try again or use the code sent to your email.'

const siteMismatchMessage = (operation: PasskeyOperation): string => operation === 'registration' ?
  'Passkeys can’t be added right now because this site’s passkey configuration is unavailable. Try again later.' :
  'Passkeys aren’t available right now. Use the code sent to your email instead.'

export const normalizePasskeyError = (
  error: unknown,
  operation: PasskeyOperation
): PasskeyOperationError => {
  const diagnostic = passkeyDiagnostic(error)

  if (matchesDiagnostic(
    diagnostic,
    ['NotAllowedError'],
    []
  )) {
    return new PasskeyOperationError(
      'passkey_cancelled_or_timed_out',
      cancelledMessage(operation),
      diagnostic,
      error
    )
  }

  if (matchesDiagnostic(
    diagnostic,
    ['SecurityError'],
    ['ERROR_INVALID_DOMAIN', 'ERROR_INVALID_RP_ID']
  )) {
    return new PasskeyOperationError(
      'passkey_site_mismatch',
      siteMismatchMessage(operation),
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

const isAuthenticationEnvelope = (
  value: unknown
): value is AuthenticationOptionsEnvelope => isRecord(value) &&
  typeof value.challengeId === 'string' &&
  isRecord(value.options) &&
  typeof value.options.challenge === 'string' &&
  typeof value.options.rpId === 'string'

const isRegistrationEnvelope = (
  value: unknown
): value is RegistrationOptionsEnvelope => isRecord(value) &&
  typeof value.challengeId === 'string' &&
  isRecord(value.options) &&
  typeof value.options.challenge === 'string' &&
  isRecord(value.options.rp) &&
  typeof value.options.rp.id === 'string' &&
  isRecord(value.options.user) &&
  typeof value.options.user.id === 'string'

const requestJson = async (
  url: string,
  init?: RequestInit
): Promise<unknown> => {
  const response = await fetch(url, { ...init, credentials: 'include' })

  if (response.status === 204) return null

  const result: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      isRecord(result) &&
      isRecord(result.error) &&
      typeof result.error.message === 'string' ?
        result.error.message :
        'The passkey request failed.'

    throw new Error(message)
  }

  return result
}

export const supportsPasskeys = (): boolean => browserSupportsWebAuthn()

export const authenticateWithPasskey = async (
  apiUrl: string
): Promise<void> => {
  const envelope = await requestJson(
    `${apiUrl}/auth/passkeys/authentication/options`,
    { method: 'POST' }
  )

  if (!isAuthenticationEnvelope(envelope)) {
    throw new Error('Invalid passkey authentication options.')
  }

  const response = await startAuthentication({
    optionsJSON: envelope.options
  }).catch((error: unknown): never => {
    throw normalizePasskeyError(error, 'authentication')
  })

  await requestJson(`${apiUrl}/auth/passkeys/authentication/verify`, {
    body: JSON.stringify({ challengeId: envelope.challengeId, response }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
}

export const registerPasskey = async (
  apiUrl: string,
  name: string
): Promise<PasskeyCredential> => {
  const envelope = await requestJson(
    `${apiUrl}/auth/passkeys/registration/options`,
    { method: 'POST' }
  )

  if (!isRegistrationEnvelope(envelope)) {
    throw new Error('Invalid passkey registration options.')
  }

  const response = await startRegistration({
    optionsJSON: envelope.options
  }).catch((error: unknown): never => {
    throw normalizePasskeyError(error, 'registration')
  })

  const credential = await requestJson(
    `${apiUrl}/auth/passkeys/registration/verify`,
    {
      body: JSON.stringify({
        challengeId: envelope.challengeId,
        name,
        response
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    }
  )

  return passkeyCredentialSchema.parse(credential)
}

export const listPasskeys = async (
  apiUrl: string
): Promise<PasskeyCredential[]> => {
  const result = await requestJson(`${apiUrl}/auth/passkeys/credentials`)

  return passkeyCredentialsSchema.parse(result).credentials
}

export const deletePasskey = async (
  apiUrl: string,
  id: string
): Promise<void> => {
  await requestJson(
    `${apiUrl}/auth/passkeys/credentials/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  )
}
