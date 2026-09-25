const MAX_AUTH_BODY_BYTES = 128 * 1024

const allowedEndpoints = new Map<string, ReadonlySet<string>>([
  ['email-otp/send-verification-otp', new Set(['POST'])],
  ['get-session', new Set(['GET'])],
  ['passkey/generate-authenticate-options', new Set(['GET'])],
  ['passkey/generate-register-options', new Set(['GET'])],
  ['passkey/verify-authentication', new Set(['POST'])],
  ['passkey/verify-registration', new Set(['POST'])],
  ['revoke-other-sessions', new Set(['POST'])],
  ['sign-in/email-otp', new Set(['POST'])],
  ['sign-out', new Set(['POST'])]
])

export interface AuthPilotTargetResult {
  allowedMethods: readonly string[]
  target: URL | null
}

const normalizeInternalOrigin = (value: string | undefined): string | null => {
  if (!value) return null

  try {
    const url = new URL(value)

    const localHttp = url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')

    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null

    return url.origin
  } catch {
    return null
  }
}

export const resolveAuthPilotTarget = (
  request: Request,
  apiInternalUrl: string | undefined
): AuthPilotTargetResult => {
  const requestUrl = new URL(request.url)
  const prefix = '/api/auth-v2/'

  const endpoint = requestUrl.pathname.startsWith(prefix) ?
    requestUrl.pathname.slice(prefix.length) :
    ''

  const allowedMethods = [...(allowedEndpoints.get(endpoint) ?? [])]
  const apiOrigin = normalizeInternalOrigin(apiInternalUrl)

  if (!apiOrigin || !allowedMethods.includes(request.method.toUpperCase()))
    return { allowedMethods, target: null }

  const target = new URL(`/api/auth/${endpoint}`, apiOrigin)

  target.search = requestUrl.search

  return { allowedMethods, target }
}

const readBoundedBody = async (request: Request): Promise<ArrayBuffer> => {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0')

  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTH_BODY_BYTES)
    throw new RangeError('auth_pilot_request_too_large')

  const body = await request.arrayBuffer()

  if (body.byteLength > MAX_AUTH_BODY_BYTES)
    throw new RangeError('auth_pilot_request_too_large')

  return body
}

export const proxyAuthPilotRequest = async (
  request: Request,
  apiInternalUrl: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<Response> => {
  const { allowedMethods, target } = resolveAuthPilotTarget(
    request, apiInternalUrl
  )

  if (!target) {
    if (allowedMethods.length === 0)
      return Response.json({ error: 'auth_pilot_endpoint_not_found' }, {
        headers: { 'Cache-Control': 'no-store' },
        status: 404
      })

    return Response.json({ error: 'auth_pilot_method_not_allowed' }, {
      headers: {
        Allow: allowedMethods.join(', '),
        'Cache-Control': 'no-store'
      },
      status: 405
    })
  }

  const headers = new Headers(request.headers)

  headers.delete('Content-Length')

  headers.delete('Host')

  let body: ArrayBuffer | undefined

  try {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      body = await readBoundedBody(request)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error

    return Response.json({ error: error.message }, {
      headers: { 'Cache-Control': 'no-store' },
      status: 413
    })
  }

  const upstream = await fetcher(target, {
    ...(body ? { body } : {}),
    headers,
    method: request.method,
    redirect: 'manual'
  })

  const responseHeaders = new Headers(upstream.headers)

  responseHeaders.set('Cache-Control', 'no-store')

  return new Response(upstream.body, {
    headers: responseHeaders,
    status: upstream.status,
    statusText: upstream.statusText
  })
}
