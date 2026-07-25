import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDirectory = resolve(import.meta.dirname, '..')
const webEnvironmentPath = resolve(rootDirectory, 'apps/web/.env')
const apiEnvironmentPath = resolve(rootDirectory, 'apps/api/.dev.vars')

if (!existsSync(webEnvironmentPath)) {
  writeFileSync(
    webEnvironmentPath,
    'PUBLIC_API_URL=http://localhost:8787\nAPI_INTERNAL_URL=http://localhost:8787\n',
  )
}

if (!existsSync(apiEnvironmentPath)) {
  const secret = randomBytes(48).toString('base64url')

  writeFileSync(
    apiEnvironmentPath,
    [
      `AUTH_SECRET=${secret}`,
      'CLOUDFLARE_ACCOUNT_ID=',
      'CLOUDFLARE_API_TOKEN=',
      'CORS_ORIGIN=http://localhost:4321,http://localhost:4322',
      'ENVIRONMENT=development',
      'MAIL_FROM=Observatory <observatory@santi020k.com>',
      'OWNER_EMAIL=hi@santi020k.com',
      'RESEND_API_KEY=',
      'GITHUB_TOKEN=',
      '',
    ].join('\n'),
  )
}

console.log('Local environment files are ready.')
