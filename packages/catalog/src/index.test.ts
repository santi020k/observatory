import { describe, expect, test } from 'vitest'

import {
  getCanonicalProjectSlug,
  getCatalogOverride,
  getFeedbackOrigins,
  getFeedbackProject,
  getGithubReleaseSources,
  getVscodeExtensionMappings,
  titleFromSlug
} from './index'

describe('project catalog', () => {
  test('provides source mappings for first-party tools', () => {
    expect(getCatalogOverride('lumen')?.npmPackages).toContain(
      '@santi020k/lumen-astro'
    )
  })

  test('maps the theme repository only to its published packages', () => {
    expect(getCatalogOverride('santi020k-theme')?.npmPackages).toEqual([
      '@santi020k/theme',
      '@santi020k/theme-core'
    ])
  })

  test('maps the retired Chrome theme repository to the unified theme', () => {
    expect(getCanonicalProjectSlug('santi020k-chrome-theme')).toBe(
      'santi020k-theme'
    )
  })

  test('creates readable fallback names', () => {
    expect(titleFromSlug('workspace-organizer')).toBe('Workspace Organizer')
  })

  test('maps VS Code extensions to their owning projects', () => {
    expect(getVscodeExtensionMappings()).toContainEqual({
      extensionId: 'santi020k.vscode-astro-doctor',
      slug: 'astro-doctor'
    })
  })

  test('maps Coolstead release assets to observable download channels', () => {
    const source = getGithubReleaseSources().find(
      candidate => candidate.repository === 'coolstead-releases'
    )

    expect(source?.slug).toBe('coolstead-releases')
    expect(source?.assets.map(asset => asset.channel)).toEqual([
      'website',
      'update',
      'homebrew-or-update'
    ])

    expect(getCatalogOverride('coolstead-releases')?.displayName).toBe(
      'Coolstead'
    )
  })

  test('registers project-scoped feedback surfaces and their trusted origins', () => {
    expect(getFeedbackProject('postlens')).toMatchObject({
      displayName: 'PostLens',
      locales: ['en', 'es']
    })
    expect(getFeedbackProject('between-contractions')).toBeDefined()
    expect(getFeedbackOrigins()).toContain('https://between.santi020k.com')
  })
})
