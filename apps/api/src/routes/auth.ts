import {
  recoveryLoginSchema,
  requestCodeSchema,
  verifyCodeSchema
} from '@santi020k/observatory-api-types'
import { Hono } from 'hono'

import type { WorkerEnv } from '../env'
import {
  logout,
  requestLoginCode,
  resolveAuthenticatedEmail,
  verifyLoginCode,
  verifyRecoveryPasscode
} from '../lib/auth'
import { logoutObservatoryOwnerAuth } from '../lib/auth-cloudflare'

import { passkeyRoutes } from './passkeys'

export const authRoutes = new Hono<WorkerEnv>()

authRoutes.route('/passkeys', passkeyRoutes)

authRoutes.post('/recovery', async context => {
  const input = recoveryLoginSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success) {
    return context.json(
      { error: { code: 'INVALID_REQUEST', message: 'Enter the recovery code.' } }, 400
    )
  }

  const result = await verifyRecoveryPasscode(context, input.data.passcode)

  if (result === 'limited') {
    return context.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Try again in fifteen minutes.'
        }
      }, 429
    )
  }

  if (result === 'invalid') {
    return context.json(
      { error: { code: 'INVALID_CODE', message: 'That recovery code is invalid.' } }, 401
    )
  }

  return context.json({ authenticated: true, email: context.env.OWNER_EMAIL })
})

authRoutes.post('/request-code', async context => {
  const input = requestCodeSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success) {
    return context.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Enter a valid email address.'
        }
      }, 400
    )
  }

  const result = await requestLoginCode(context, input.data.email)

  return context.json(result, 202)
})

authRoutes.post('/verify-code', async context => {
  const input = verifyCodeSchema.safeParse(
    await context.req.json().catch(() => null)
  )

  if (!input.success) {
    return context.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Enter the six-digit code.'
        }
      }, 400
    )
  }

  const valid = await verifyLoginCode(
    context, input.data.email, input.data.code
  )

  if (!valid) {
    return context.json(
      {
        error: {
          code: 'INVALID_CODE',
          message: 'That code is invalid or expired.'
        }
      }, 401
    )
  }

  return context.json({ authenticated: true, email: input.data.email })
})

authRoutes.get('/session', async context => {
  const email = await resolveAuthenticatedEmail(context)

  return context.json(
    email ? { authenticated: true, email } : { authenticated: false }
  )
})

authRoutes.post('/logout', async context => {
  const packageResponse = await logoutObservatoryOwnerAuth(context)

  if (!packageResponse.ok) return packageResponse

  await logout(context)

  for (const cookie of packageResponse.headers.getSetCookie())
    context.header('Set-Cookie', cookie, { append: true })

  return context.json({ authenticated: false })
})
