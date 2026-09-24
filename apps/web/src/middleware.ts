import type { MiddlewareHandler } from 'astro'

export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next()

  response.headers.set('Content-Signal', 'search=no, ai-input=no, ai-train=no')

  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')

  return response
}
