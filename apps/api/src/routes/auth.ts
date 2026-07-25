import {
  requestCodeSchema,
  verifyCodeSchema,
} from '@santi020k/observatory-api-types'
import { Hono } from 'hono'

import type { WorkerEnv } from '../env'
import {
  logout,
  requestLoginCode,
  resolveSessionEmail,
  verifyLoginCode,
} from '../lib/auth'

export const authRoutes = new Hono<WorkerEnv>()

authRoutes.post('/request-code', async (context) => {
  const input = requestCodeSchema.safeParse(
    await context.req.json().catch(() => null),
  )

  if (!input.success) {
    return context.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Enter a valid email address.',
        },
      },
      400,
    )
  }

  const result = await requestLoginCode(context, input.data.email)

  return context.json(result, 202)
})

authRoutes.post('/verify-code', async (context) => {
  const input = verifyCodeSchema.safeParse(
    await context.req.json().catch(() => null),
  )

  if (!input.success) {
    return context.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Enter the six-digit code.',
        },
      },
      400,
    )
  }

  const valid = await verifyLoginCode(
    context,
    input.data.email,
    input.data.code,
  )

  if (!valid) {
    return context.json(
      {
        error: {
          code: 'INVALID_CODE',
          message: 'That code is invalid or expired.',
        },
      },
      401,
    )
  }

  return context.json({ authenticated: true, email: input.data.email })
})

authRoutes.get('/session', async (context) => {
  const email = await resolveSessionEmail(context)

  return context.json(
    email ? { authenticated: true, email } : { authenticated: false },
  )
})

authRoutes.post('/logout', async (context) => {
  await logout(context)

  return context.json({ authenticated: false })
})
