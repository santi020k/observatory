import type { SnapshotWrite } from '@santi020k/observatory-db'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { collectorInternals } from './collector'

const repository = (name: string, fork = false) => ({
  archived: false,
  description: null,
  fork,
  'forks_count': 0,
  homepage: null,
  'html_url': `https://github.com/santi020k/${name}`,
  name,
  'open_issues_count': 0,
  private: false,
  'pushed_at': '2026-07-25T00:00:00Z',
  'stargazers_count': 0,
  topics: [],
})

const snapshot = (
  slug: string,
  values: Partial<SnapshotWrite> = {},
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
  ...values,
})

const requestUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input

  if (input instanceof URL) return input.href

  return input.url
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('public project collection', () => {
  it('paginates GitHub repository discovery and excludes forks', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      repository(`project-${index}`, index === 0),
    )

    const secondPage = [repository('project-100')]

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

    expect(projects.some((project) => project.name === 'project-0')).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails repository discovery on an upstream HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    )

    await expect(
      collectorInternals.collectGithubRepositories(),
    ).rejects.toThrow('Provider request failed with 503')
  })

  it('does not replace package metrics with zeros on provider failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(null, { status: 429 })),
      ),
    )

    await expect(
      collectorInternals.collectPackageMetrics(['@santi020k/lumen']),
    ).rejects.toThrow('Provider request failed with 429')
  })

  it('uses zero downloads when npm has package metadata but no download history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input)

        if (url.includes('api.npmjs.org/downloads')) {
          return Promise.resolve(new Response(null, { status: 404 }))
        }

        return Promise.resolve(
          Response.json({ 'dist-tags': { latest: '0.1.0' } }),
        )
      }),
    )

    await expect(
      collectorInternals.collectPackageMetrics(['@santi020k/lumen-astro']),
    ).resolves.toEqual({
      downloads: 0,
      latestVersion: '0.1.0',
    })
  })

  it('still fails when the package itself is missing from the npm registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = requestUrl(input)

        if (url.includes('api.npmjs.org/downloads')) {
          return Promise.resolve(new Response(null, { status: 404 }))
        }

        return Promise.resolve(new Response(null, { status: 404 }))
      }),
    )

    await expect(
      collectorInternals.collectPackageMetrics(['missing-package']),
    ).rejects.toThrow('Provider request failed with 404')
  })

  it('falls back to a small GET when a website rejects HEAD requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 206 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      collectorInternals.checkWebsite('https://example.com'),
    ).resolves.toMatchObject({ status: 'healthy' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com',
      expect.objectContaining({ headers: { Range: 'bytes=0-0' } }),
    )
  })

  it('weights npm downloads more heavily than website page views', () => {
    const projects = [
      snapshot('package', { npmDownloads30d: 1_000 }),
      snapshot('website'),
    ]

    const pageViews = new Map([['website', 10_000]])

    const scored = collectorInternals.scoreSnapshotsByRelevance(
      projects,
      pageViews,
      Date.parse('2026-07-25T00:00:00Z'),
    )

    expect(scored.find(({ slug }) => slug === 'package')?.relevanceScore).toBe(
      54,
    )

    expect(scored.find(({ slug }) => slug === 'website')?.relevanceScore).toBe(
      24,
    )
  })
})
