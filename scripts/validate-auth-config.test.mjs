import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  loadAuthEnvironment,
  validateAuthEnvironment,
  validateAuthPath
} from './validate-auth-config.mjs'

const validEnvironment = {
  API_INTERNAL_URL: 'https://api.observatory.example',
  CORS_ORIGIN: 'https://observatory.example',
  PUBLIC_API_URL: 'https://api.observatory.example',
  SITE_URL: 'https://observatory.example'
}

test('accepts complete split-origin authentication configuration', () => {
  assert.deepEqual(validateAuthEnvironment(validEnvironment), {
    invalidKeys: [],
    valid: true
  })
})

test('rejects a proxy loop, mismatched API origins, and missing CORS', () => {
  assert.deepEqual(validateAuthEnvironment({
    ...validEnvironment,
    API_INTERNAL_URL: 'https://observatory.example',
    CORS_ORIGIN: 'https://elsewhere.example',
    PUBLIC_API_URL: 'https://public-api.example'
  }), {
    invalidKeys: [
      'API_INTERNAL_URL',
      'CORS_ORIGIN',
      'PUBLIC_API_URL'
    ],
    valid: false
  })
})

test('validates each deployment path independently', () => {

  assert.equal(validateAuthPath(validEnvironment, 'api').valid, true)

  assert.equal(validateAuthPath(validEnvironment, 'web').valid, true)

  assert.deepEqual(validateAuthPath({}, 'api'), {
    invalidKeys: ['CORS_ORIGIN', 'SITE_URL'],
    valid: false
  })
})

test('rejects unknown deployment paths', () => {
  assert.throws(
    () => validateAuthPath(validEnvironment, 'other'),
    /Unknown auth path/u
  )
})

test('loads local API and web configuration when process values are absent', context => {
  const directory = mkdtempSync(join(tmpdir(), 'observatory-auth-'))

  context.after(() => rmSync(directory, { force: true, recursive: true }))

  mkdirSync(join(directory, 'apps/api'), { recursive: true })

  mkdirSync(join(directory, 'apps/web'), { recursive: true })

  writeFileSync(join(directory, 'apps/api/.dev.vars'), [
    'CORS_ORIGIN=http://localhost:4321',
    'SITE_URL=http://localhost:4321'
  ].join('\n'))

  writeFileSync(join(directory, 'apps/web/.env'), [
    'API_INTERNAL_URL=http://localhost:8787',
    'PUBLIC_API_URL=http://localhost:8787'
  ].join('\n'))

  assert.equal(validateAuthEnvironment(
    loadAuthEnvironment({}, directory)
  ).valid, true)
})

test('permits HTTP only for loopback development origins', () => {
  assert.equal(validateAuthEnvironment({
    API_INTERNAL_URL: 'http://localhost:8787',
    CORS_ORIGIN: 'http://localhost:4321',
    PUBLIC_API_URL: 'http://localhost:8787',
    SITE_URL: 'http://localhost:4321'
  }).valid, true)

  assert.equal(validateAuthEnvironment({
    ...validEnvironment,
    API_INTERNAL_URL: 'http://api.observatory.example'
  }).valid, false)
})
