import type { APIRoute } from 'astro'

export const prerender = false

const MAX_RECOVERY_BODY_BYTES = 8 * 1024

export const POST: APIRoute = async ({ request }) => {
  const declaredLength = Number(request.headers.get('Content-Length') ?? '0')

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RECOVERY_BODY_BYTES
  ) return new Response(null, { status: 413 })

  const body = await request.arrayBuffer()

  if (body.byteLength > MAX_RECOVERY_BODY_BYTES)
    return new Response(null, { status: 413 })

  const apiUrl = import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL

  if (!apiUrl) return new Response(null, { status: 503 })

  const headers = new Headers(request.headers)

  headers.delete('Content-Length')

  headers.delete('Host')

  const response = await fetch(new URL('/auth/recovery', apiUrl), {
    body,
    headers,
    method: 'POST',
    redirect: 'manual'
  })

  const responseHeaders = new Headers(response.headers)

  responseHeaders.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText
  })
}

export const DELETE: APIRoute = async ({ request }) => {
  const apiUrl = import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL

  if (!apiUrl) return new Response(null, { status: 503 })

  const response = await fetch(new URL('/auth/recovery', apiUrl), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    method: 'DELETE',
    redirect: 'manual'
  })

  const responseHeaders = new Headers(response.headers)

  responseHeaders.set('Cache-Control', 'no-store')

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText
  })
}
