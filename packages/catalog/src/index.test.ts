import { describe, expect, test } from 'vitest'

import {
  getCanonicalProjectSlug,
  getCatalogOverride,
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
})
