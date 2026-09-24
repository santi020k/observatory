import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next()

  response.headers.set('Content-Signal', 'search=no, ai-input=no, ai-train=no')

  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')

  return response
})
