export type ProjectCategory = 'app' | 'content' | 'library' | 'tool'
export type ProjectStatus = 'active' | 'archived' | 'maintained' | 'paused'

export interface CatalogOverride {
  category: ProjectCategory
  displayName: string
  npmPackages?: readonly string[]
  status: ProjectStatus
}

export const githubOwner = 'santi020k'

export const catalogOverrides = new Map<string, CatalogOverride>(
  Object.entries({
    'astro-doctor': {
      category: 'tool',
      displayName: 'Astro Doctor',
      npmPackages: [
        '@santi020k/astro-doctor',
        '@santi020k/eslint-plugin-astro-doctor',
        '@santi020k/oxlint-config-astro-doctor'
      ],
      status: 'active'
    },
    'dep-beacon': {
      category: 'tool',
      displayName: 'Dep Beacon',
      npmPackages: ['@santi020k/dep-beacon-core'],
      status: 'active'
    },
    difftale: {
      category: 'tool',
      displayName: 'Difftale',
      status: 'active'
    },
    'eslint-config-basic': {
      category: 'library',
      displayName: 'ESLint Config Basic',
      npmPackages: ['@santi020k/eslint-config-basic'],
      status: 'active'
    },
    'homebrew-tap': {
      category: 'tool',
      displayName: 'Homebrew Tap',
      status: 'maintained'
    },
    lumen: {
      category: 'library',
      displayName: 'Lumen UI',
      npmPackages: [
        '@santi020k/lumen',
        '@santi020k/lumen-astro',
        '@santi020k/lumen-core',
        '@santi020k/lumen-elements',
        '@santi020k/lumen-react'
      ],
      status: 'active'
    },
    'santi020k-theme': {
      category: 'library',
      displayName: 'Santi020k Theme',
      npmPackages: [
        '@santi020k/theme',
        '@santi020k/theme-core'
      ],
      status: 'active'
    },
    website: {
      category: 'content',
      displayName: 'Personal Website',
      status: 'active'
    },
    'workspace-organizer': {
      category: 'app',
      displayName: 'Workspace Organizer',
      status: 'active'
    }
  } satisfies Record<string, CatalogOverride>)
)

export const getCatalogOverride = (
  repository: string
): CatalogOverride | undefined => catalogOverrides.get(repository)

export const titleFromSlug = (slug: string): string => slug
  .split('-')
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')
