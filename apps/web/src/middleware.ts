import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next()

  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')

  return response
})
