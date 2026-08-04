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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

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
    const message = isRecord(result) && isRecord(result.error) &&
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
    `${apiUrl}/auth/passkeys/authentication/options`, { method: 'POST' }
  )

  if (!isAuthenticationEnvelope(envelope)) {
    throw new Error('Invalid passkey authentication options.')
  }

  const response = await startAuthentication({ optionsJSON: envelope.options })

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
    `${apiUrl}/auth/passkeys/registration/options`, { method: 'POST' }
  )

  if (!isRegistrationEnvelope(envelope)) {
    throw new Error('Invalid passkey registration options.')
  }

  const response = await startRegistration({ optionsJSON: envelope.options })

  const credential = await requestJson(
    `${apiUrl}/auth/passkeys/registration/verify`, {
      body: JSON.stringify({ challengeId: envelope.challengeId, name, response }),
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
    `${apiUrl}/auth/passkeys/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' }
  )
}
