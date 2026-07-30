import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDirectory = resolve(import.meta.dirname, '..')
const apiEnvironmentPath = resolve(rootDirectory, 'apps/api/.dev.vars')

if (!existsSync(apiEnvironmentPath)) {
  throw new Error('Run `pnpm setup:local` before configuring GitHub access.')
}

let token

try {
  token = execFileSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  throw new Error('Authenticate the GitHub CLI with `gh auth login` first.')
}

if (!token) {
  throw new Error('The GitHub CLI did not return an authentication token.')
}

const currentEnvironment = readFileSync(apiEnvironmentPath, 'utf8')
const tokenEntry = `GITHUB_TOKEN=${token}`

const nextEnvironment = /^GITHUB_TOKEN=.*$/mu.test(currentEnvironment)
  ? currentEnvironment.replace(/^GITHUB_TOKEN=.*$/mu, tokenEntry)
  : `${currentEnvironment.replace(/\n?$/u, '\n')}${tokenEntry}\n`

writeFileSync(apiEnvironmentPath, nextEnvironment, { mode: 0o600 })

chmodSync(apiEnvironmentPath, 0o600)

process.stdout.write('Local GitHub access is configured for Observatory.\n')
