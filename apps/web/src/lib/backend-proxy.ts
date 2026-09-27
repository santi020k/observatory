const MAX_API_BODY_BYTES = 256 * 1024

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

export const resolveBackendTarget = (
  request: Request,
  apiInternalUrl: string | undefined
): URL | null => {
  const apiOrigin = normalizeInternalOrigin(apiInternalUrl)

  if (!apiOrigin) return null

  const requestUrl = new URL(request.url)
  const prefix = '/api/backend/'

  if (!requestUrl.pathname.startsWith(prefix)) return null

  let path: string

  try {
    path = decodeURIComponent(requestUrl.pathname.slice(prefix.length))
  } catch {
    return null
  }

  if (/%(?:25|2e|2f|5c)/iu.test(path)) return null

  const segments = path
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .map(segment => segment.toLowerCase())

  if (
    segments.length === 0 ||
    segments.includes('..') ||
    segments[0] === 'auth' ||
    (segments[0] === 'api' && segments[1] === 'auth')
  ) return null

  const target = new URL(`/${path}`, apiOrigin)

  target.search = requestUrl.search

  return target
}

const readBoundedBody = async (request: Request): Promise<ArrayBuffer> => {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0')

  if (Number.isFinite(declaredLength) && declaredLength > MAX_API_BODY_BYTES)
    throw new RangeError('api_request_too_large')

  const body = await request.arrayBuffer()

  if (body.byteLength > MAX_API_BODY_BYTES)
    throw new RangeError('api_request_too_large')

  return body
}

export const proxyBackendRequest = async (
  request: Request,
  apiInternalUrl: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<Response> => {
  const target = resolveBackendTarget(request, apiInternalUrl)

  if (!target)
    return Response.json({ error: 'api_endpoint_not_found' }, {
      headers: { 'Cache-Control': 'no-store' },
      status: 404
    })

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
