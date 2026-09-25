import { proxyAuthPilotRequest } from '@/lib/auth-pilot-proxy'

import type { APIRoute } from 'astro'

export const prerender = false

export const ALL: APIRoute = async ({ request }) => {
  if (import.meta.env.PUBLIC_AUTH_PILOT_ENABLED !== 'true')
    return Response.json({ error: 'auth_pilot_disabled' }, {
      headers: { 'Cache-Control': 'no-store' },
      status: 404
    })

  return proxyAuthPilotRequest(request, import.meta.env.API_INTERNAL_URL)
}
