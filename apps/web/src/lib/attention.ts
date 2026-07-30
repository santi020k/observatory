import type { ProjectMetric } from '@santi020k/observatory-api-types'

type AttentionProject = Pick<
  ProjectMetric,
  'attentionMode' | 'healthStatus' | 'openIssues' | 'pushedAt'
>

const staleAfterMilliseconds = 120 * 24 * 60 * 60 * 1_000

export const needsAttention = (
  project: AttentionProject,
  now = Date.now()
): boolean => {
  if (project.attentionMode === 'off') return false

  if (project.attentionMode === 'health')
    return project.healthStatus === 'degraded'

  const pushedAt = project.pushedAt ? Date.parse(project.pushedAt) : 0
  const stale = now - pushedAt > staleAfterMilliseconds

  return (
    project.openIssues > 0 || project.healthStatus === 'degraded' || stale
  )
}
