import { describe, expect, test } from 'vitest'

import {
  compareProjectSortRecords,
  type ProjectSortRecord
} from './project-sort'

const project = (
  overrides: Partial<ProjectSortRecord> = {}
): ProjectSortRecord => ({
  downloads: 0,
  growthChange: 0,
  growthPriority: 0,
  name: 'Project',
  relevance: 0,
  stars: 0,
  updated: 0,
  ...overrides
})

describe('project portfolio sorting', () => {
  test('prioritizes the growth signal before velocity', () => {
    const growing = project({
      growthChange: 4,
      growthPriority: 3,
      name: 'Growing'
    })

    const steady = project({
      growthChange: 500,
      growthPriority: 2,
      name: 'Steady'
    })

    expect(compareProjectSortRecords(growing, steady, 'momentum')).toBeLessThan(0)
  })

  test('uses velocity and then adoption to break momentum ties', () => {
    const faster = project({ growthChange: 20, growthPriority: 3, stars: 1 })
    const slower = project({ growthChange: 5, growthPriority: 3, stars: 100 })

    expect(compareProjectSortRecords(faster, slower, 'momentum')).toBeLessThan(0)

    const popular = project({ growthChange: 5, growthPriority: 3, stars: 10 })
    const emerging = project({ growthChange: 5, growthPriority: 3, stars: 2 })

    expect(compareProjectSortRecords(popular, emerging, 'momentum')).toBeLessThan(0)
  })

  test('retains the existing relevance default', () => {
    const relevant = project({ relevance: 90 })
    const secondary = project({ relevance: 40 })

    expect(compareProjectSortRecords(relevant, secondary, 'unknown')).toBeLessThan(0)
  })
})
