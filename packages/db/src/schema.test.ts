import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { authCodes, projectSnapshots, sessions, syncRuns } from './schema'

describe('observatory database schema', () => {
  it('keeps authentication and analytics in separate tables', () => {
    expect(getTableName(authCodes)).toBe('auth_codes')

    expect(getTableName(sessions)).toBe('sessions')

    expect(getTableName(projectSnapshots)).toBe('project_snapshots')

    expect(getTableName(syncRuns)).toBe('sync_runs')
  })

  it('stores visibility on every project snapshot', () => {
    expect(projectSnapshots.visibility.name).toBe('visibility')

    expect(projectSnapshots.visibility.notNull).toBe(true)
  })

  it('associates snapshots with the sync run that produced them', () => {
    expect(projectSnapshots.syncRunId.name).toBe('sync_run_id')
  })
})
