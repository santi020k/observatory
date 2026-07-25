import { describe, expect, it } from 'vitest'

import { getCatalogOverride, titleFromSlug } from './index'

describe('project catalog', () => {
  it('provides source mappings for first-party tools', () => {
    expect(getCatalogOverride('lumen')?.npmPackages).toContain(
      '@santi020k/lumen-astro',
    )
  })

  it('creates readable fallback names', () => {
    expect(titleFromSlug('workspace-organizer')).toBe('Workspace Organizer')
  })
})
