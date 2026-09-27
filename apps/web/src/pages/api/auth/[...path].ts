import { proxyAuthRequest } from '@/lib/auth-proxy'

import type { APIRoute } from 'astro'

export const prerender = false

export const ALL: APIRoute = async ({ request }) => proxyAuthRequest(
  request,
  import.meta.env.API_INTERNAL_URL
)
