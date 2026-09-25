import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDirectory = resolve(import.meta.dirname, '..')
const webEnvironmentPath = resolve(rootDirectory, 'apps/web/.env')
const apiEnvironmentPath = resolve(rootDirectory, 'apps/api/.dev.vars')

const ensureEnvironmentFile = (path, lines) => {
  if (!existsSync(path)) {
    writeFileSync(path, [...lines, ''].join('\n'))

    return
  }

  const existing = readFileSync(path, 'utf8')

  const keys = new Set(existing
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.slice(0, line.indexOf('='))))

  const missing = lines.filter(line => !keys.has(line.slice(0, line.indexOf('='))))

  if (missing.length === 0) return

  writeFileSync(path, `${existing.trimEnd()}\n${missing.join('\n')}\n`)
}

ensureEnvironmentFile(
  webEnvironmentPath,
  [
      'PUBLIC_API_URL=http://localhost:8787',
      'API_INTERNAL_URL=http://localhost:8787',
    'PUBLIC_AUTH_PILOT_ENABLED=true'
  ]
)

const secret = randomBytes(48).toString('base64url')

ensureEnvironmentFile(
  apiEnvironmentPath,
  [
      'APP_STORE_CONNECT_ISSUER_ID=',
      'APP_STORE_CONNECT_KEY_ID=',
      'APP_STORE_CONNECT_PRIVATE_KEY=',
      'APP_STORE_CONNECT_REPORT_REQUESTS_JSON=',
      `AUTH_SECRET=${secret}`,
      'AUTH_PILOT_ENABLED=true',
      'CLOUDFLARE_ACCOUNT_ID=',
      'CLOUDFLARE_API_TOKEN=',
      'CORS_ORIGIN=http://localhost:4321,http://localhost:4322',
      'ENVIRONMENT=development',
      'FEEDBACK_HASH_SECRET=',
      'MAIL_FROM=Observatory <observatory@santi020k.com>',
      'OWNER_EMAIL=hi@santi020k.com',
      'OWNER_PASSCODE=local-owner-recovery-only',
      'RESEND_API_KEY=',
      'SITE_URL=http://localhost:4321',
      'TURNSTILE_SITE_KEY=',
      'TURNSTILE_SECRET_KEY=',
      'GITHUB_TOKEN=',
      'GOOGLE_PLAY_REPORT_BUCKET=',
    'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='
  ]
)

process.stdout.write('Local environment files are ready.\n')
