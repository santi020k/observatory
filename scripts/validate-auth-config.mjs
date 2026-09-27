import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const localEnvironmentKeys = new Set([
  'API_INTERNAL_URL',
  'CORS_ORIGIN',
  'PUBLIC_API_URL',
  'SITE_URL'
])

const pathRequirements = {
  api: ['CORS_ORIGIN', 'SITE_URL'],
  web: ['API_INTERNAL_URL', 'PUBLIC_API_URL']
}

const isLocalHostname = hostname => hostname === '127.0.0.1' || hostname === 'localhost'

const parseOrigin = value => {
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const url = new URL(value)
    const localHttp = url.protocol === 'http:' && isLocalHostname(url.hostname)

    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null

    return url.origin
  } catch {
    return null
  }
}

const readLocalEnvironmentFile = path => {
  if (!existsSync(path)) return {}

  return Object.fromEntries(readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const separator = line.indexOf('=')

      return [line.slice(0, separator), line.slice(separator + 1)]
    })
    .filter(([key]) => localEnvironmentKeys.has(key)))
}

export const loadAuthEnvironment = (
  processEnvironment,
  rootDirectory = resolve(import.meta.dirname, '..')
) => ({
  ...readLocalEnvironmentFile(resolve(rootDirectory, 'apps/api/.dev.vars')),
  ...readLocalEnvironmentFile(resolve(rootDirectory, 'apps/web/.env')),
  ...processEnvironment
})

export const validateAuthEnvironment = environment => {
  const apiInternalOrigin = parseOrigin(environment.API_INTERNAL_URL)
  const publicApiOrigin = parseOrigin(environment.PUBLIC_API_URL)
  const siteOrigin = parseOrigin(environment.SITE_URL)

  const corsOrigins = typeof environment.CORS_ORIGIN === 'string' ?
    environment.CORS_ORIGIN.split(',').map(value => value.trim()) :
    []

  const checks = [
    ['API_INTERNAL_URL', apiInternalOrigin !== null],
    ['API_INTERNAL_URL', apiInternalOrigin !== siteOrigin],
    ['CORS_ORIGIN', siteOrigin !== null && corsOrigins.includes(siteOrigin)],
    ['PUBLIC_API_URL', publicApiOrigin !== null],
    ['PUBLIC_API_URL', apiInternalOrigin === publicApiOrigin],
    ['SITE_URL', siteOrigin !== null]
  ]

  const invalidKeys = checks
    .filter(([, valid]) => !valid)
    .map(([key]) => key)

  return {
    invalidKeys: [...new Set(invalidKeys)].sort(),
    valid: invalidKeys.length === 0
  }
}

export const validateAuthPath = (environment, path) => {
  const required = pathRequirements[path]

  if (!required) throw new TypeError(`Unknown auth path: ${path}`)

  const invalidKeys = required.filter(key =>
    typeof environment[key] !== 'string' || environment[key].trim() === ''
  )

  return { invalidKeys, valid: invalidKeys.length === 0 }
}

const run = () => {
  const pathArgument = process.argv.slice(2)
    .find(argument => argument.startsWith('--path='))

  const path = pathArgument?.slice('--path='.length)

  const result = path ?
    validateAuthPath(process.env, path) :
    validateAuthEnvironment(loadAuthEnvironment(process.env))

  if (!result.valid) {
    console.error(`Invalid auth configuration: ${result.invalidKeys.join(', ')}`)

    process.exitCode = 1

    return
  }

  process.stdout.write(
    path ? `Auth ${path} path is valid.\n` : 'Auth configuration is complete.\n'
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) run()
