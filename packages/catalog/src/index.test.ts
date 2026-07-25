import { describe, expect, it } from 'vitest'

import { getCatalogOverride, titleFromSlug } from './index'

describe('project catalog', () => {
  it('provides source mappings for first-party tools', () => {
    expect(getCatalogOverride('lumen')?.npmPackages).toContain(
      '@santi020k/lumen-astro',
    )
  })

  it('maps the theme repository only to its published packages', () => {
    expect(getCatalogOverride('santi020k-theme')?.npmPackages).toEqual([
      '@santi020k/theme',
      '@santi020k/theme-core',
    ])
  })

  it('creates readable fallback names', () => {
    expect(titleFromSlug('workspace-organizer')).toBe('Workspace Organizer')
  })

})
