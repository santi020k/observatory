import { recoveryLoginSchema } from '@santi020k/observatory-api-types'
import { Hono } from 'hono'

import type { WorkerEnv } from '../env'
import { logoutRecoverySession, verifyRecoveryPasscode } from '../lib/auth'

export const authRoutes = new Hono<WorkerEnv>()

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

authRoutes.delete('/recovery', async context => {
  await logoutRecoverySession(context)

  return context.json({ authenticated: false })
})
