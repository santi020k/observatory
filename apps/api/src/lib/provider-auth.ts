const textEncoder = new TextEncoder()
const googleTokenUri = 'https://oauth2.googleapis.com/token'

const base64Url = (value: Uint8Array | string): string => {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value
  let binary = ''

  for (const byte of bytes) binary += String.fromCodePoint(byte)

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

const decodePem = (pem: string): ArrayBuffer => {
  const encoded = pem.replaceAll('\\n', '\n')
    .replaceAll(/-----BEGIN [^-]+-----/gu, '')
    .replaceAll(/-----END [^-]+-----/gu, '')
    .replaceAll(/\s+/gu, '')

  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.codePointAt(index) ?? 0

  return bytes.buffer
}

export const createAppleToken = async (credentials: {
  issuerId: string
  keyId: string
  privateKey: string
}, now: number = Date.now()): Promise<string> => {
  const header = base64Url(JSON.stringify({
    alg: 'ES256',
    kid: credentials.keyId,
    typ: 'JWT'
  }))

  const issuedAt = Math.floor(now / 1_000)

  const payload = base64Url(JSON.stringify({
    aud: 'appstoreconnect-v1',
    exp: issuedAt + 15 * 60,
    iat: issuedAt,
    iss: credentials.issuerId
  }))

  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(credentials.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    { hash: 'SHA-256', name: 'ECDSA' },
    key,
    textEncoder.encode(signingInput)
  )

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}

export interface GoogleServiceAccount {
  clientEmail: string
  privateKey: string
  tokenUri: string
}

export const parseGoogleServiceAccount = (
  input: string
): GoogleServiceAccount => {
  const parsed: unknown = JSON.parse(input)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('client_email' in parsed) ||
    typeof parsed.client_email !== 'string' ||
    !('private_key' in parsed) ||
    typeof parsed.private_key !== 'string'
  ) throw new Error('Google Play service account configuration is invalid.')

  const tokenUri = 'token_uri' in parsed && typeof parsed.token_uri === 'string' ?
    parsed.token_uri :
    googleTokenUri

  if (tokenUri !== googleTokenUri)
    throw new Error('Google Play service account token URI is invalid.')

  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
    tokenUri
  }
}

export const createGoogleServiceAccountAssertion = async (
  account: GoogleServiceAccount,
  scope: string,
  now: number = Date.now()
): Promise<string> => {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const issuedAt = Math.floor(now / 1_000)

  const payload = base64Url(JSON.stringify({
    aud: account.tokenUri,
    exp: issuedAt + 60 * 60,
    iat: issuedAt,
    iss: account.clientEmail,
    scope
  }))

  const signingInput = `${header}.${payload}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(account.privateKey),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    textEncoder.encode(signingInput)
  )

  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}
