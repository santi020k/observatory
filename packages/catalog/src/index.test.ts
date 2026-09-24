import { describe, expect, test } from 'vitest'

import {
  getCanonicalProjectSlug,
  getCatalogOverride,
  getFeedbackOrigins,
  getFeedbackProject,
  getGithubReleaseSources,
  getPublishedApps,
  getVscodeExtensionMappings,
  titleFromSlug
} from './index'

describe('project catalog', () => {
  test('provides source mappings for first-party tools', () => {
    expect(getCatalogOverride('lumen')?.npmPackages).toContain(
      '@santi020k/lumen-astro'
    )
  })

  test('registers OG and Quality with their published surfaces', () => {
    expect(getCatalogOverride('og')).toMatchObject({
      category: 'library',
      displayName: 'OG',
      npmPackages: ['@santi020k/og']
    })
    expect(getCatalogOverride('quality')).toMatchObject({
      category: 'tool',
      displayName: 'Quality'
    })

    expect(getGithubReleaseSources()).toContainEqual({
      assets: [{
        assetNamePattern: '^quality-.*\\.(?:tar\\.gz|zip)$',
        channel: 'direct'
      }],
      repository: 'quality',
      slug: 'quality'
    })
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
    expect(getFeedbackProject('roadscore')).toMatchObject({
      displayName: 'RoadScore',
      locales: ['en', 'es']
    })
    expect(getFeedbackProject('between-contractions')).toBeDefined()
    expect(getFeedbackOrigins()).toContain('https://between.santi020k.com')
    expect(getFeedbackOrigins()).toContain('https://roadscore.santi020k.com')
  })

  test('registers published native apps and their store identities', () => {
    const postLens = getPublishedApps().find(app => app.slug === 'postlens')
    const between = getPublishedApps().find(
      app => app.slug === 'betweencontractions'
    )

    expect(postLens?.apple?.appId).toBe('6804601300')
    expect(between?.apple?.appId).toBe('6802499436')
    expect(between?.google?.packageName).toBe(
      'com.santi020k.betweencontractions'
    )
  })
})
