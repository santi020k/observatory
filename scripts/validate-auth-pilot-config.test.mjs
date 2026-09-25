import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  loadAuthPilotEnvironment,
  validateAuthPilotEnvironment
} from './validate-auth-pilot-config.mjs'

const validEnvironment = {
  API_INTERNAL_URL: 'https://api.observatory.example',
  AUTH_PILOT_ENABLED: 'true',
  CORS_ORIGIN: 'https://observatory.example',
  PUBLIC_API_URL: 'https://api.observatory.example',
  PUBLIC_AUTH_PILOT_ENABLED: 'true',
  SITE_URL: 'https://observatory.example'
}

test('accepts a disabled pilot without deployment configuration', () => {
  assert.deepEqual(validateAuthPilotEnvironment({}), {
    enabled: false,
    invalidKeys: [],
    valid: true
  })
})

test('rejects API and browser rollout flag drift', () => {
  assert.deepEqual(validateAuthPilotEnvironment({
    AUTH_PILOT_ENABLED: 'true',
    PUBLIC_AUTH_PILOT_ENABLED: 'false'
  }), {
    enabled: false,
    invalidKeys: ['AUTH_PILOT_ENABLED', 'PUBLIC_AUTH_PILOT_ENABLED'],
    valid: false
  })
})

test('loads the setup-local API and web files when process values are absent', context => {
  const directory = mkdtempSync(join(tmpdir(), 'observatory-auth-pilot-'))

  context.after(() => rmSync(directory, { force: true, recursive: true }))

  mkdirSync(join(directory, 'apps/api'), { recursive: true })

  mkdirSync(join(directory, 'apps/web'), { recursive: true })

  writeFileSync(join(directory, 'apps/api/.dev.vars'), [
    'AUTH_PILOT_ENABLED=true',
    'CORS_ORIGIN=http://localhost:4321',
    'SITE_URL=http://localhost:4321'
  ].join('\n'))

  writeFileSync(join(directory, 'apps/web/.env'), [
    'API_INTERNAL_URL=http://localhost:8787',
    'PUBLIC_API_URL=http://localhost:8787',
    'PUBLIC_AUTH_PILOT_ENABLED=true'
  ].join('\n'))

  const environment = loadAuthPilotEnvironment({}, directory)

  assert.equal(validateAuthPilotEnvironment(environment).valid, true)
})

test('accepts isolated application and API origins', () => {
  assert.deepEqual(validateAuthPilotEnvironment(validEnvironment), {
    enabled: true,
    invalidKeys: [],
    valid: true
  })
})

test('rejects a proxy loop, mismatched API origins, and missing CORS', () => {
  assert.deepEqual(validateAuthPilotEnvironment({
    ...validEnvironment,
    API_INTERNAL_URL: 'https://observatory.example',
    CORS_ORIGIN: 'https://elsewhere.example',
    PUBLIC_API_URL: 'https://public-api.example'
  }), {
    enabled: true,
    invalidKeys: [
      'API_INTERNAL_URL',
      'CORS_ORIGIN',
      'PUBLIC_API_URL'
    ],
    valid: false
  })
})

test('permits HTTP only for loopback development origins', () => {
  assert.equal(validateAuthPilotEnvironment({
    API_INTERNAL_URL: 'http://localhost:8787',
    AUTH_PILOT_ENABLED: 'true',
    CORS_ORIGIN: 'http://localhost:4321',
    PUBLIC_API_URL: 'http://localhost:8787',
    PUBLIC_AUTH_PILOT_ENABLED: 'true',
    SITE_URL: 'http://localhost:4321'
  }).valid, true)

  assert.equal(validateAuthPilotEnvironment({
    ...validEnvironment,
    API_INTERNAL_URL: 'http://api.observatory.example'
  }).valid, false)
})
