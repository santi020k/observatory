import { describe, expect, test } from 'vitest'

import { parseGoogleServiceAccount } from './provider-auth'

describe('provider authentication configuration', () => {
  test('parses the official Google service-account token endpoint', () => {
    expect(parseGoogleServiceAccount(JSON.stringify({
      client_email: 'reports@example.iam.gserviceaccount.com',
      private_key: 'private-key',
      token_uri: 'https://oauth2.googleapis.com/token'
    }))).toEqual({
      clientEmail: 'reports@example.iam.gserviceaccount.com',
      privateKey: 'private-key',
      tokenUri: 'https://oauth2.googleapis.com/token'
    })
  })

  test('rejects an untrusted Google assertion destination', () => {
    expect(() => parseGoogleServiceAccount(JSON.stringify({
      client_email: 'reports@example.iam.gserviceaccount.com',
      private_key: 'private-key',
      token_uri: 'https://example.com/token'
    }))).toThrow('Google Play service account token URI is invalid.')
  })
})
