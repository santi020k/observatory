import { proxyBackendRequest } from '@/lib/backend-proxy'

import type { APIRoute } from 'astro'

export const prerender = false

export const ALL: APIRoute = async ({ request }) => proxyBackendRequest(
  request,
  import.meta.env.API_INTERNAL_URL ?? import.meta.env.PUBLIC_API_URL
)
