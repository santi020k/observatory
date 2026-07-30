import { describe, expect, test } from 'vitest'

import { getCatalogOverride, titleFromSlug } from './index'

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

  test('creates readable fallback names', () => {
    expect(titleFromSlug('workspace-organizer')).toBe('Workspace Organizer')
  })
})
