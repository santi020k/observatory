import { describe, expect, test } from 'vitest'

import { buildGrowthMap, type GrowthMapInput } from './growth-map'

const project = (
  overrides: Partial<GrowthMapInput> = {}
): GrowthMapInput => ({
  momentumPercent: 10,
  name: 'Project',
  observations: 3,
  reach: 100,
  signal: 'growing',
  slug: 'project',
  ...overrides
})

describe('portfolio growth map', () => {
  test('excludes projects without comparable npm history', () => {
    const map = buildGrowthMap([
      project(),
      project({ momentumPercent: null, slug: 'no-baseline' }),
      project({ observations: 1, slug: 'sparse' }),
      project({ reach: 0, slug: 'no-reach' })
    ])

    expect(map.points).toHaveLength(1)
    expect(map.excludedCount).toBe(3)
  })

  test('uses logarithmic reach positions and a symmetric momentum axis', () => {
    const map = buildGrowthMap([
      project({ momentumPercent: 40, reach: 10, slug: 'small' }),
      project({ momentumPercent: 0, reach: 100, slug: 'middle' }),
      project({ momentumPercent: -40, reach: 1_000, slug: 'large' })
    ])

    expect(map.points.find(point => point.slug === 'small')).toMatchObject({
      x: 8,
      y: 8
    })

    expect(map.points.find(point => point.slug === 'middle')).toMatchObject({
      x: 50,
      y: 50
    })

    expect(map.points.find(point => point.slug === 'large')).toMatchObject({
      x: 92,
      y: 92
    })

    expect(map.reachDividerX).toBe(50)
  })

  test('classifies strategic quadrants around median reach and zero growth', () => {
    const map = buildGrowthMap([
      project({ momentumPercent: 15, reach: 10, slug: 'emerging' }),
      project({ momentumPercent: 20, reach: 1_000, slug: 'scale' }),
      project({ momentumPercent: -5, reach: 20, slug: 'explore' }),
      project({ momentumPercent: -8, reach: 2_000, slug: 'recover' })
    ])

    expect(
      Object.fromEntries(map.points.map(point => [point.slug, point.quadrant]))
    ).toEqual({
      emerging: 'emerging',
      explore: 'explore',
      recover: 'recover',
      scale: 'scale'
    })

    expect(
      map.points.every(point => point.quadrant === 'scale' || point.quadrant === 'recover' ?
        point.x >= map.reachDividerX :
        point.x <= map.reachDividerX)
    ).toBe(true)
  })
})
