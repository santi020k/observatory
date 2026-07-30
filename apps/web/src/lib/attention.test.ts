import { describe, expect, test } from 'vitest'

import { needsAttention } from './attention'

const healthyProject = {
  attentionMode: 'all' as const,
  healthStatus: 'healthy' as const,
  openIssues: 0,
  pushedAt: '2026-07-24T00:00:00.000Z'
}

describe('project attention preferences', () => {
  test('allows all operational signals by default', () => {
    expect(
      needsAttention(
        { ...healthyProject, openIssues: 2 }, Date.parse('2026-07-25T00:00:00.000Z')
      )
    ).toBe(true)
  })

  test('limits health-only projects to degraded health', () => {
    expect(
      needsAttention({
        ...healthyProject,
        attentionMode: 'health',
        openIssues: 2
      })
    ).toBe(false)

    expect(
      needsAttention({
        ...healthyProject,
        attentionMode: 'health',
        healthStatus: 'degraded'
      })
    ).toBe(true)
  })

  test('keeps muted projects out of the queue', () => {
    expect(
      needsAttention({
        ...healthyProject,
        attentionMode: 'off',
        healthStatus: 'degraded',
        openIssues: 5
      })
    ).toBe(false)
  })
})
