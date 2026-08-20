import type { SnapshotWrite } from '@santi020k/observatory-db'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { collectorInternals } from './collector'

const githubField = {
  forksCount: 'forks_count',
  htmlUrl: 'html_url',
  openIssuesCount: 'open_issues_count',
  pushedAt: 'pushed_at',
  stargazersCount: 'stargazers_count'
} as const

const repository = (name: string, fork = false) => ({
  archived: false,
  description: null,
  fork,
  [githubField.forksCount]: 0,
  homepage: null,
  [githubField.htmlUrl]: `https://github.com/santi020k/${name}`,
  name,
  [githubField.openIssuesCount]: 0,
  private: false,
  [githubField.pushedAt]: '2026-07-25T00:00:00Z',
  [githubField.stargazersCount]: 0,
  topics: []
})

const snapshot = (
  slug: string,
  values: Partial<SnapshotWrite> = {}
): SnapshotWrite => ({
  archived: false,
  category: 'library',
  collectedAt: Date.parse('2026-07-25T00:00:00Z'),
  description: null,
  forks: 0,
  githubClones14d: 0,
  githubViews14d: 0,
  healthStatus: 'unknown',
  id: slug,
  latestVersion: null,
  name: slug,
  npmDownloads30d: 0,
  npmPackages: [],
  openIssues: 0,
  pushedAt: '2026-07-25T00:00:00Z',
  relevanceScore: 0,
  repositoryUrl: `https://github.com/santi020k/${slug}`,
  responseTimeMs: null,
  slug,
  stars: 0,
  status: 'active',
  syncRunId: 'sync-run',
  topics: [],
  visibility: 'public',
  websiteUrl: null,
  ...values
})

const requestUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input

  if (input instanceof URL) return input.href

  return input.url
}

afterEach(() => {
  vi.useRealTimers()

  vi.unstubAllGlobals()
})

describe('public project collection', () => {
  test('paginates discovery and excludes forks and retired repositories', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => repository(`project-${index}`, index === 0))

    const secondPage = [
      repository('project-100'),
      repository('santi020k-chrome-theme')
    ]

    const fetchMock = vi.fn((input: string | URL | Request) => {
      let url: string

      if (typeof input === 'string') url = input
      else if (input instanceof URL) url = input.href
      else url = input.url

      const body = url.includes('page=2') ? secondPage : firstPage

      return Promise.resolve(Response.json(body))
    })

    vi.stubGlobal('fetch', fetchMock)

    const projects =
      await collectorInternals.collectGithubRepositories('github-token')

    expect(projects).toHaveLength(100)

    expect(projects.some(project => project.name === 'project-0')).toBe(false)

    expect(
      projects.some(project => project.name === 'santi020k-chrome-theme')
    ).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('retries repository discovery after a transport timeout', async () => {
    vi.useFakeTimers()

    const timeoutError = new Error('The operation was aborted due to timeout')

    timeoutError.name = 'TimeoutError'

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(Response.json([repository('project')]))

    vi.stubGlobal('fetch', fetchMock)

    const collection = collectorInternals.collectGithubRepositories()

    await vi.runAllTimersAsync()

    await expect(collection).resolves.toEqual([repository('project')])

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('fails repository discovery on an upstream HTTP error', async () => {
    vi.stubGlobal(
      'fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
    )

    await expect(
      collectorInternals.collectGithubRepositories()
    ).rejects.toThrow('Provider request failed with 503')
  })

  test('omits uncached packages instead of inventing zeros on rate limits', async () => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 429 })))
    )

    const collection = collectorInternals.collectPackageMetrics([
      '@santi020k/lumen'
    ])
    await vi.runAllTimersAsync()

    await expect(collection).resolves.toMatchObject({
      downloads: 0,
      packages: []
    })
  })

  test('preserves cached downloads when npm temporarily rate limits', async () => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 429 })))
    )

    const packageNames = ['@santi020k/lumen']
    const latestDates = new Map([
      ['@santi020k/lumen', Date.UTC(2026, 6, 29)]
    ])
    const now = Date.parse('2026-07-30T12:00:00.000Z')
    const latestVersions = new Map([['@santi020k/lumen', '1.0.0']])
    const cachedDownloads = [{
      collectedAt: Date.UTC(2026, 6, 29),
      downloads: 42,
      id: 'cached-downloads',
      packageName: '@santi020k/lumen',
      periodStart: Date.UTC(2026, 6, 29),
      slug: 'lumen'
    }]
    const collection = collectorInternals.collectPackageMetrics(
      packageNames, latestDates, now, latestVersions, cachedDownloads
    )

    await vi.runAllTimersAsync()

    await expect(collection).resolves.toMatchObject({
      downloads: 42,
      packages: [{ downloads: 42, packageName: '@santi020k/lumen' }]
    })
  })

  test('uses zero downloads when npm has package metadata but no download history', async () => {
    vi.stubGlobal(
      'fetch', vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input)

        if (url.includes('api.npmjs.org/downloads')) {
          return Promise.resolve(new Response(null, { status: 404 }))
        }

        return Promise.resolve(
          Response.json({ 'dist-tags': { latest: '0.1.0' } })
        )
      })
    )

    await expect(
      collectorInternals.collectPackageMetrics(['@santi020k/lumen-astro'])
    ).resolves.toEqual({
      downloadHistory: [],
      downloads: 0,
      latestVersion: '0.1.0',
      packages: [
        {
          downloadHistory: [],
          downloads: 0,
          latestVersion: '0.1.0',
          packageName: '@santi020k/lumen-astro'
        }
      ]
    })
  })

  test('collects exact daily npm history and derives the rolling total', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input)

      if (url.includes('api.npmjs.org/downloads')) {
        return Promise.resolve(
          Response.json({
            downloads: [
              { day: '2026-07-28', downloads: 20 },
              { day: '2026-07-29', downloads: 30 }
            ]
          })
        )
      }

      return Promise.resolve(
        Response.json({ 'dist-tags': { latest: '0.4.0' } })
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      collectorInternals.collectPackageMetrics(
        ['@santi020k/lumen'], new Map(), Date.parse('2026-07-30T12:00:00.000Z')
      )
    ).resolves.toMatchObject({
      downloadHistory: [
        {
          day: '2026-07-28',
          downloads: 20,
          packageName: '@santi020k/lumen'
        },
        {
          day: '2026-07-29',
          downloads: 30,
          packageName: '@santi020k/lumen'
        }
      ],
      downloads: 50,
      latestVersion: '0.4.0'
    })

    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes(
        '/range/2025-07-30:2026-07-29/%40santi020k%2Flumen'
      ))
    ).toBe(true)
  })

  test('uses average downloads when multiple packages map to one project', () => {
    const packageMetric = (
      packageName: string,
      downloads: number
    ) => ({
      downloadHistory: [],
      downloads,
      latestVersion: '1.0.0',
      packageName
    })
    const metricsByPackage = new Map([
      ['@santi020k/eslint-config-basic', packageMetric(
        '@santi020k/eslint-config-basic', 100
      )],
      ['@santi020k/eslint-config-typescript', packageMetric(
        '@santi020k/eslint-config-typescript', 20
      )]
    ])

    expect(collectorInternals.mergePackageMetrics(
      [...metricsByPackage.keys()], metricsByPackage
    ).downloads).toBe(60)
  })

  test('bounds concurrent npm requests to avoid provider rate limits', async () => {
    let activeRequests = 0
    let maximumActiveRequests = 0

    vi.stubGlobal(
      'fetch', vi.fn(async () => {
        activeRequests += 1
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)

        await Promise.resolve()

        activeRequests -= 1

        return Response.json({ downloads: [] })
      })
    )

    const packageNames = Array.from(
      { length: 4 }, (_, index) => `@santi020k/package-${index}`
    )
    const now = Date.parse('2026-07-30T12:00:00.000Z')
    const latestVersions = new Map(
      packageNames.map(name => [name, '1.0.0'])
    )

    await collectorInternals.collectPackageMetrics(
      packageNames, new Map(), now, latestVersions
    )

    expect(maximumActiveRequests).toBe(1)
  })

  test('still fails when the package itself is missing from the npm registry', async () => {
    vi.stubGlobal(
      'fetch', vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input)

        if (url.includes('api.npmjs.org/downloads')) {
          return Promise.resolve(new Response(null, { status: 404 }))
        }

        return Promise.resolve(new Response(null, { status: 404 }))
      })
    )

    await expect(
      collectorInternals.collectPackageMetrics(['missing-package'])
    ).rejects.toThrow('Provider request failed with 404')
  })

  test('collects mapped VS Code Marketplace extension statistics', async () => {
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) => {
        const requestBody = init?.body

        if (typeof requestBody !== 'string')
          throw new TypeError('Expected a serialized request body.')

        const body = JSON.parse(requestBody) as {
          filters: { criteria: { value: string }[] }[]
        }
        const extensionId = body.filters[0]?.criteria[0]?.value ?? ''
        const extensionParts = extensionId.split('.')
        const extensionName =
          extensionParts[extensionParts.length - 1] ?? extensionId

        return Promise.resolve(
          Response.json({
            results: [
              {
                extensions: [
                  {
                    extensionName,
                    publisher: { publisherName: 'Santi020k' },
                    statistics: [
                      { statisticName: 'downloadCount', value: 166 },
                      { statisticName: 'install', value: 5 },
                      { statisticName: 'updateCount', value: 7 },
                      { statisticName: 'weightedRating', value: 4.5 }
                    ],
                    versions: [
                      {
                        lastUpdated: '2026-07-27T01:44:14.250Z',
                        version: '1.2.2'
                      }
                    ]
                  }
                ]
              }
            ]
          })
        )
      }
    )

    vi.stubGlobal('fetch', fetchMock)

    const snapshots = await collectorInternals.collectVscodeExtensions(
      Date.UTC(2026, 6, 30), 'sync-run'
    )

    expect(snapshots).toHaveLength(3)
    expect(snapshots).toContainEqual(
      expect.objectContaining({
        downloads: 166,
        extensionId: 'santi020k.vscode-astro-doctor',
        installs: 5,
        slug: 'astro-doctor',
        syncRunId: 'sync-run',
        version: '1.2.2'
      })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('extensionquery'), expect.objectContaining({ method: 'POST' })
    )
  })

  test('collects mapped Open VSX extension statistics separately', async () => {
    vi.stubGlobal(
      'fetch', vi.fn(() => Promise.resolve(Response.json({
        averageRating: null,
        downloadCount: 1_280,
        name: 'vscode-astro-doctor',
        namespace: 'santi020k',
        reviewCount: 0,
        timestamp: '2026-07-27T01:40:02.517925Z',
        version: '1.2.2'
      })))
    )

    const snapshots = await collectorInternals.collectOpenVsxExtensions(
      Date.UTC(2026, 6, 30), 'sync-run'
    )

    expect(snapshots).toHaveLength(3)
    expect(snapshots).toContainEqual(expect.objectContaining({
      downloads: 1_280,
      extensionId: 'santi020k.vscode-astro-doctor',
      provider: 'open-vsx',
      reviewCount: 0,
      slug: 'astro-doctor'
    }))
  })

  test('falls back to a small GET when a website rejects HEAD requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      collectorInternals.checkWebsite('https://example.com')
    ).resolves.toMatchObject({ status: 'healthy' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2, 'https://example.com', expect.objectContaining({ headers: { Range: 'bytes=0-0' } })
    )
  })

  test('weights npm downloads more heavily than website page views', () => {
    const projects = [
      snapshot('package', { npmDownloads30d: 1_000 }),
      snapshot('website')
    ]

    const pageViews = new Map([['website', 10_000]])

    const scored = collectorInternals.scoreSnapshotsByRelevance(
      projects, pageViews, Date.parse('2026-07-25T00:00:00Z')
    )

    expect(scored.find(({ slug }) => slug === 'package')?.relevanceScore).toBe(
      54
    )

    expect(scored.find(({ slug }) => slug === 'website')?.relevanceScore).toBe(
      24
    )
  })
})
