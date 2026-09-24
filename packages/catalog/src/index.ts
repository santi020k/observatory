export type ProjectCategory = 'app' | 'content' | 'library' | 'tool'
export type ProjectStatus = 'active' | 'archived' | 'maintained' | 'paused'

export interface CatalogOverride {
  category: ProjectCategory
  displayName: string
  npmPackages?: readonly string[]
  status: ProjectStatus
  vscodeExtensions?: readonly string[]
}

export type ReleaseDownloadChannel = 'homebrew' |
  'homebrew-or-update' |
  'direct' |
  'update' |
  'website'

export interface GithubReleaseAssetMapping {
  assetNamePattern: string
  channel: ReleaseDownloadChannel
}

export interface GithubReleaseSource {
  assets: readonly GithubReleaseAssetMapping[]
  repository: string
  slug: string
}

export interface FeedbackProject {
  allowedOrigins: readonly string[]
  displayName: string
  locales: readonly string[]
  slug: string
}

export interface AppleStoreListing {
  appId: string
  bundleId: string
}

export interface GooglePlayListing {
  packageName: string
}

export interface PublishedApp {
  apple?: AppleStoreListing
  displayName: string
  google?: GooglePlayListing
  slug: string
}

const feedbackProjects = new Map<string, FeedbackProject>([
  ['postlens', {
    allowedOrigins: [
      'https://postlens.santi020k.com',
      'http://localhost:4176',
      'http://127.0.0.1:4176',
      'http://localhost:4321',
      'http://127.0.0.1:4321'
    ],
    displayName: 'PostLens',
    locales: ['en', 'es'],
    slug: 'postlens'
  }],
  ['roadscore', {
    allowedOrigins: [
      'https://roadscore.santi020k.com',
      'http://localhost:4321',
      'http://127.0.0.1:4321',
      'http://localhost:4322',
      'http://127.0.0.1:4322'
    ],
    displayName: 'RoadScore',
    locales: ['en', 'es'],
    slug: 'roadscore'
  }],
  ['between-contractions', {
    allowedOrigins: [
      'https://between.santi020k.com',
      'http://localhost:4321',
      'http://127.0.0.1:4321',
      'http://localhost:4322',
      'http://127.0.0.1:4322'
    ],
    displayName: 'Between Contractions',
    locales: ['en', 'es'],
    slug: 'between-contractions'
  }]
])

export const getFeedbackProject = (
  slug: string
): FeedbackProject | undefined => feedbackProjects.get(slug)

export const getFeedbackProjects = (): FeedbackProject[] => [
  ...feedbackProjects.values()
]

export const getFeedbackOrigins = (): string[] => [
  ...new Set(getFeedbackProjects().flatMap(project => project.allowedOrigins))
]

const publishedApps: readonly PublishedApp[] = [
  {
    apple: {
      appId: '6805250815',
      bundleId: 'com.santi020k.lumen.playground.apple'
    },
    displayName: 'Lumen Playground',
    slug: 'lumen'
  },
  {
    apple: {
      appId: '6804601300',
      bundleId: 'com.santi020k.PostLens'
    },
    displayName: 'PostLens',
    slug: 'postlens'
  },
  {
    apple: {
      appId: '6802499436',
      bundleId: 'com.santi020k.betweencontractions'
    },
    displayName: 'Between Contractions',
    slug: 'betweencontractions'
  }
]

export const getPublishedApps = (): readonly PublishedApp[] => publishedApps

export const githubOwner = 'santi020k'

const projectAliases = new Map<string, string>([
  ['santi020k-chrome-theme', 'santi020k-theme']
])

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
      status: 'active',
      vscodeExtensions: ['santi020k.vscode-astro-doctor']
    },
    'coolstead-releases': {
      category: 'app',
      displayName: 'Coolstead',
      status: 'active'
    },
    'dep-beacon': {
      category: 'tool',
      displayName: 'Dep Beacon',
      npmPackages: ['@santi020k/dep-beacon-core'],
      status: 'active',
      vscodeExtensions: ['santi020k.vscode-dep-beacon']
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
    og: {
      category: 'library',
      displayName: 'OG',
      npmPackages: ['@santi020k/og'],
      status: 'active'
    },
    quality: {
      category: 'tool',
      displayName: 'Quality',
      status: 'active'
    },
    'santi020k-theme': {
      category: 'library',
      displayName: 'Santi020k Theme',
      npmPackages: ['@santi020k/theme', '@santi020k/theme-core'],
      status: 'active',
      vscodeExtensions: ['santi020k.santi020k-theme']
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

const githubReleaseSources: readonly GithubReleaseSource[] = [
  {
    assets: [
      {
        assetNamePattern: '^Coolstead\\.dmg$',
        channel: 'website'
      },
      {
        assetNamePattern: '^Coolstead-[0-9].*-sparkle\\.dmg$',
        channel: 'update'
      },
      {
        assetNamePattern: '^Coolstead-[0-9].*\\.dmg$',
        channel: 'homebrew-or-update'
      }
    ],
    repository: 'coolstead-releases',
    slug: 'coolstead-releases'
  },
  {
    assets: [
      {
        assetNamePattern: '^quality-.*\\.(?:tar\\.gz|zip)$',
        channel: 'direct'
      }
    ],
    repository: 'quality',
    slug: 'quality'
  }
]

export const getGithubReleaseSources = (): readonly GithubReleaseSource[] => githubReleaseSources

export const getCatalogOverride = (
  repository: string
): CatalogOverride | undefined => catalogOverrides.get(repository)

export const getCanonicalProjectSlug = (slug: string): string => projectAliases.get(slug) ?? slug

interface VscodeExtensionMapping {
  extensionId: string
  slug: string
}

const toVscodeExtensionMappings = ([slug, project]: [
  string,
  CatalogOverride
]): VscodeExtensionMapping[] => (project.vscodeExtensions ?? []).map(
  extensionId => ({ extensionId, slug })
)

export const getVscodeExtensionMappings = (): VscodeExtensionMapping[] => Array
  .from(catalogOverrides)
  .flatMap(toVscodeExtensionMappings)

export const titleFromSlug = (slug: string): string => slug
  .split('-')
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ')
