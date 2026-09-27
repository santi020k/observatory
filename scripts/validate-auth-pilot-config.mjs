import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const localEnvironmentKeys = new Set([
  'API_INTERNAL_URL',
  'AUTH_PILOT_ENABLED',
  'CORS_ORIGIN',
  'PUBLIC_API_URL',
  'PUBLIC_AUTH_PILOT_ENABLED',
  'SITE_URL'
])

const pilotPathRequirements = {
  api: {
    flag: 'AUTH_PILOT_ENABLED',
    requiredWhenEnabled: ['CORS_ORIGIN', 'SITE_URL']
  },
  web: {
    flag: 'PUBLIC_AUTH_PILOT_ENABLED',
    requiredWhenEnabled: ['API_INTERNAL_URL', 'PUBLIC_API_URL']
  }
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

const readPilotFlags = environment => {
  const publicFlag = environment.PUBLIC_AUTH_PILOT_ENABLED ?? 'false'
  const apiFlag = environment.AUTH_PILOT_ENABLED ?? 'false'
  const invalidKeys = []

  if (!['false', 'true'].includes(publicFlag))
    invalidKeys.push('PUBLIC_AUTH_PILOT_ENABLED')

  if (!['false', 'true'].includes(apiFlag))
    invalidKeys.push('AUTH_PILOT_ENABLED')

  if (publicFlag !== apiFlag)
    invalidKeys.push('AUTH_PILOT_ENABLED', 'PUBLIC_AUTH_PILOT_ENABLED')

  return {
    enabled: publicFlag === 'true' && apiFlag === 'true',
    invalidKeys
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

export const loadAuthPilotEnvironment = (
  processEnvironment,
  rootDirectory = resolve(import.meta.dirname, '..')
) => ({
  ...readLocalEnvironmentFile(resolve(rootDirectory, 'apps/api/.dev.vars')),
  ...readLocalEnvironmentFile(resolve(rootDirectory, 'apps/web/.env')),
  ...processEnvironment
})

export const validateAuthPilotEnvironment = environment => {
  const { enabled, invalidKeys } = readPilotFlags(environment)

  if (!enabled) return {
    enabled: false,
    invalidKeys: [...new Set(invalidKeys)].sort(),
    valid: invalidKeys.length === 0
  }

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

  invalidKeys.push(...checks
    .filter(([, valid]) => !valid)
    .map(([key]) => key))

  return {
    enabled: true,
    invalidKeys: [...new Set(invalidKeys)].sort(),
    valid: invalidKeys.length === 0
  }
}

export const validateAuthPilotPath = (environment, path) => {
  const requirements = pilotPathRequirements[path]

  if (!requirements) throw new TypeError(`Unknown auth pilot path: ${path}`)

  const flag = environment[requirements.flag]
  const invalidKeys = []

  if (!['false', 'true'].includes(flag)) invalidKeys.push(requirements.flag)

  if (flag === 'true') invalidKeys.push(...requirements.requiredWhenEnabled
    .filter(key => typeof environment[key] !== 'string' || environment[key].trim() === ''))

  return {
    enabled: flag === 'true',
    invalidKeys,
    valid: invalidKeys.length === 0
  }
}

const run = () => {
  const pathArgument = process.argv.slice(2)
    .find(argument => argument.startsWith('--path='))

  const path = pathArgument?.slice('--path='.length)

  const result = path ?
    validateAuthPilotPath(process.env, path) :
    validateAuthPilotEnvironment(loadAuthPilotEnvironment(process.env))

  if (!result.valid) {
    console.error(
      `Invalid auth pilot configuration: ${result.invalidKeys.join(', ')}`
    )

    process.exitCode = 1

    return
  }

  let message = 'Auth pilot is disabled.\n'

  if (path) message = `Auth pilot ${path} path is valid.\n`
  else if (result.enabled) message = 'Auth pilot configuration is complete.\n'

  process.stdout.write(message)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) run()
