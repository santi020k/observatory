import assert from 'node:assert/strict'
import test from 'node:test'

import { validateReleaseTag } from './validate-release-tag.mjs'

const matchingManifests = [
  { name: 'root', path: '/workspace/package.json', version: '0.2.0' },
  { name: 'web', path: '/workspace/apps/web/package.json', version: '0.2.0' },
]

test('accepts a tag that matches every workspace version', () => {
  assert.equal(validateReleaseTag('v0.2.0', matchingManifests), '0.2.0')
})

test('accepts a valid prerelease tag', () => {
  const manifests = [
    {
      name: 'root',
      path: '/workspace/package.json',
      version: '1.0.0-beta.1',
    },
  ]

  assert.equal(validateReleaseTag('v1.0.0-beta.1', manifests), '1.0.0-beta.1')
})

test('rejects malformed release tags', () => {
  assert.throws(
    () => validateReleaseTag('release-0.2.0', matchingManifests),
    /must use the v<semver> format/u,
  )
})

test('reports every mismatched workspace version', () => {
  const manifests = [
    ...matchingManifests,
    { name: 'api', path: '/workspace/apps/api/package.json', version: '0.1.0' },
  ]

  assert.throws(
    () => validateReleaseTag('v0.2.0', manifests),
    /api is 0\.1\.0/u,
  )
})
