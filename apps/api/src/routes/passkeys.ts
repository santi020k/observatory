import type {
  PasskeyCredential,
  VerifyPasskeyAuthenticationInput,
  VerifyPasskeyRegistrationInput
} from '@santi020k/observatory-api-types'
import {
  verifyPasskeyAuthenticationSchema,
  verifyPasskeyRegistrationSchema
} from '@santi020k/observatory-api-types'
import {
  consumePasskeyChallenge,
  createDb,
  deleteExpiredPasskeyChallenges,
  deletePasskeyCredential,
  findPasskeyCredential,
  insertPasskeyChallenge,
  insertPasskeyCredential,
  listPasskeyCredentials,
  updatePasskeyCredential
} from '@santi020k/observatory-db'
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON
} from '@simplewebauthn/server'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { WorkerEnv } from '../env'
import { createOwnerSession, requireAuth } from '../lib/auth'

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000

const isAuthenticatorTransport = (
  value: unknown
): value is AuthenticatorTransportFuture => [
  'ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'
].includes(String(value))

const parseTransports = (value: string): AuthenticatorTransportFuture[] => {
  try {
    const parsed: unknown = JSON.parse(value)

    return Array.isArray(parsed) ? parsed.filter(isAuthenticatorTransport) : []
  } catch {
    return []
  }
}

const getRelyingParty = (siteUrl: string): { id: string, origin: string } => {
  const url = new URL(siteUrl)

  return { id: url.hostname, origin: url.origin }
}

const toAuthenticationResponse = (
  response: VerifyPasskeyAuthenticationInput['response']
): AuthenticationResponseJSON => ({
  clientExtensionResults: {},
  id: response.id,
  rawId: response.rawId,
  response: {
    authenticatorData: response.response.authenticatorData,
    clientDataJSON: response.response.clientDataJSON,
    signature: response.response.signature,
    ...(response.response.userHandle === undefined ?
      {} :
      { userHandle: response.response.userHandle })
  },
  type: 'public-key',
  ...(response.authenticatorAttachment === undefined ?
    {} :
    { authenticatorAttachment: response.authenticatorAttachment })
})

const toRegistrationResponse = (
  response: VerifyPasskeyRegistrationInput['response']
): RegistrationResponseJSON => ({
  clientExtensionResults: {},
  id: response.id,
  rawId: response.rawId,
  response: {
    attestationObject: response.response.attestationObject,
    clientDataJSON: response.response.clientDataJSON,
    ...(response.response.transports === undefined ?
      {} :
      { transports: response.response.transports })
  },
  type: 'public-key',
  ...(response.authenticatorAttachment === undefined ?
    {} :
    { authenticatorAttachment: response.authenticatorAttachment })
})

const toPublicCredential = (row: {
  backedUp: boolean
  createdAt: number
  deviceType: 'multiDevice' | 'singleDevice'
  id: string
  lastUsedAt: number | null
  name: string
}): PasskeyCredential => ({
  backedUp: row.backedUp,
  createdAt: row.createdAt,
  deviceType: row.deviceType,
  id: row.id,
  lastUsedAt: row.lastUsedAt,
  name: row.name
})

const invalidRequest = (context: Context<WorkerEnv>) => context.json({
  error: { code: 'INVALID_REQUEST', message: 'The passkey request is invalid.' }
}, 400)

const invalidPasskey = (context: Context<WorkerEnv>) => context.json({
  error: { code: 'INVALID_PASSKEY', message: 'The passkey could not be verified.' }
}, 401)

const storeChallenge = async (
  context: Context<WorkerEnv>,
  challenge: string,
  purpose: 'authentication' | 'registration',
  ownerEmail: string | null
): Promise<string> => {
  const database = createDb(context.env.DB)
  const now = Date.now()
  const id = crypto.randomUUID()

  await deleteExpiredPasskeyChallenges(database, now)

  await insertPasskeyChallenge(database, {
    challenge,
    expiresAt: now + CHALLENGE_LIFETIME_MS,
    id,
    ownerEmail,
    purpose
  })

  return id
}

const registerCredential = async (
  context: Context<WorkerEnv>,
  input: VerifyPasskeyRegistrationInput,
  challenge: string
) => {
  const relyingParty = getRelyingParty(context.env.SITE_URL)

  const verification = await verifyRegistrationResponse({
    expectedChallenge: challenge,
    expectedOrigin: relyingParty.origin,
    expectedRPID: relyingParty.id,
    requireUserVerification: true,
    response: toRegistrationResponse(input.response)
  })

  if (!verification.verified) {
    return context.json({
      error: { code: 'PASSKEY_REGISTRATION_FAILED', message: 'The passkey could not be created.' }
    }, 422)
  }

  const { credential, credentialBackedUp, credentialDeviceType } =
    verification.registrationInfo

  const createdAt = Date.now()

  await insertPasskeyCredential(createDb(context.env.DB), {
    backedUp: credentialBackedUp,
    counter: credential.counter,
    createdAt,
    deviceType: credentialDeviceType,
    id: credential.id,
    name: input.name,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    transports: JSON.stringify(credential.transports ?? [])
  })

  return context.json(toPublicCredential({
    backedUp: credentialBackedUp,
    createdAt,
    deviceType: credentialDeviceType,
    id: credential.id,
    lastUsedAt: null,
    name: input.name
  }), 201)
}

export const passkeyRoutes = new Hono<WorkerEnv>()

passkeyRoutes.post('/registration/options', requireAuth, async context => {
  const database = createDb(context.env.DB)
  const credentials = await listPasskeyCredentials(database)
  const relyingParty = getRelyingParty(context.env.SITE_URL)
  const ownerEmail = context.get('sessionEmail')

  const options = await generateRegistrationOptions({
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required'
    },
    excludeCredentials: credentials.map(credential => ({
      id: credential.id,
      transports: parseTransports(credential.transports)
    })),
    rpID: relyingParty.id,
    rpName: 'Observatory Admin',
    userDisplayName: 'Observatory owner',
    userID: new TextEncoder().encode(ownerEmail),
    userName: ownerEmail
  })

  const challengeId = await storeChallenge(
    context, options.challenge, 'registration', ownerEmail
  )

  context.header('Cache-Control', 'private, no-store, max-age=0')

  return context.json({ challengeId, options })
})

passkeyRoutes.post('/registration/verify', requireAuth, async context => {
  const input = verifyPasskeyRegistrationSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success) return invalidRequest(context)

  const ownerEmail = context.get('sessionEmail')
  const database = createDb(context.env.DB)

  const challenge = await consumePasskeyChallenge(database, {
    id: input.data.challengeId,
    now: Date.now(),
    ownerEmail,
    purpose: 'registration'
  })

  if (!challenge) {
    return context.json({
      error: { code: 'INVALID_PASSKEY_CHALLENGE', message: 'The passkey request expired.' }
    }, 400)
  }

  try {
    return await registerCredential(context, input.data, challenge)
  } catch {
    return context.json({
      error: { code: 'PASSKEY_REGISTRATION_FAILED', message: 'The passkey could not be created.' }
    }, 422)
  }
})

passkeyRoutes.post('/authentication/options', async context => {
  const relyingParty = getRelyingParty(context.env.SITE_URL)

  const options = await generateAuthenticationOptions({
    allowCredentials: [],
    rpID: relyingParty.id,
    userVerification: 'required'
  })

  const challengeId = await storeChallenge(
    context, options.challenge, 'authentication', null
  )

  context.header('Cache-Control', 'private, no-store, max-age=0')

  return context.json({ challengeId, options })
})

passkeyRoutes.post('/authentication/verify', async context => {
  const input = verifyPasskeyAuthenticationSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success) return invalidRequest(context)

  const database = createDb(context.env.DB)

  const challenge = await consumePasskeyChallenge(database, {
    id: input.data.challengeId,
    now: Date.now(),
    ownerEmail: null,
    purpose: 'authentication'
  })

  const credential = await findPasskeyCredential(
    database, input.data.response.id
  )

  if (!challenge || !credential) return invalidPasskey(context)

  try {
    const relyingParty = getRelyingParty(context.env.SITE_URL)

    const verification = await verifyAuthenticationResponse({
      credential: {
        counter: credential.counter,
        id: credential.id,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        transports: parseTransports(credential.transports)
      },
      expectedChallenge: challenge,
      expectedOrigin: relyingParty.origin,
      expectedRPID: relyingParty.id,
      requireUserVerification: true,
      response: toAuthenticationResponse(input.data.response)
    })

    if (!verification.verified) return invalidPasskey(context)

    await updatePasskeyCredential(database, credential.id, {
      backedUp: verification.authenticationInfo.credentialBackedUp,
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      lastUsedAt: Date.now()
    })

    await createOwnerSession(context)

    return context.json({ authenticated: true, email: context.env.OWNER_EMAIL })
  } catch {
    return invalidPasskey(context)
  }
})

passkeyRoutes.get('/credentials', requireAuth, async context => {
  const rows = await listPasskeyCredentials(createDb(context.env.DB))

  context.header('Cache-Control', 'private, no-store, max-age=0')

  return context.json({ credentials: rows.map(toPublicCredential) })
})

passkeyRoutes.delete('/credentials/:id', requireAuth, async context => {
  const deleted = await deletePasskeyCredential(
    createDb(context.env.DB), context.req.param('id')
  )

  if (!deleted) {
    return context.json({
      error: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found.' }
    }, 404)
  }

  return context.body(null, 204)
})
