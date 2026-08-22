export type GrowthMapQuadrant = 'emerging' | 'explore' | 'recover' | 'scale'

export interface GrowthMapInput {
  momentumPercent: number | null
  name: string
  observations: number
  reach: number
  signal: 'accelerating' | 'growing' | 'insufficient' | 'slowing' | 'steady'
  slug: string
}

export interface GrowthMapPoint extends Omit<GrowthMapInput, 'momentumPercent'> {
  momentumPercent: number
  quadrant: GrowthMapQuadrant
  x: number
  y: number
}

export interface GrowthMap {
  excludedCount: number
  maxMomentum: number
  medianReach: number
  points: GrowthMapPoint[]
  reachDividerX: number
}

const getMedian = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[middle] ?? 0

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const scale = (
  value: number,
  minimum: number,
  maximum: number,
  outputMinimum: number,
  outputMaximum: number
): number => {
  if (minimum === maximum) return (outputMinimum + outputMaximum) / 2

  return outputMinimum +
    ((value - minimum) / (maximum - minimum)) *
    (outputMaximum - outputMinimum)
}

const getQuadrant = (
  reach: number,
  momentum: number,
  medianReach: number
): GrowthMapQuadrant => {
  if (momentum >= 0) return reach >= medianReach ? 'scale' : 'emerging'

  return reach >= medianReach ? 'recover' : 'explore'
}

const isComparable = (
  project: GrowthMapInput
): project is GrowthMapInput & { momentumPercent: number } => project.observations >= 2 &&
  project.momentumPercent !== null &&
  project.reach > 0

export const buildGrowthMap = (
  projects: readonly GrowthMapInput[]
): GrowthMap => {
  const comparable = projects.filter(isComparable)

  if (comparable.length === 0)
    return {
      excludedCount: projects.length,
      maxMomentum: 0,
      medianReach: 0,
      points: [],
      reachDividerX: 50
    }

  const medianReach = getMedian(comparable.map(project => project.reach))
  const loggedReach = comparable.map(project => Math.log10(project.reach))
  const minimumReach = Math.min(...loggedReach)
  const maximumReach = Math.max(...loggedReach)

  const reachDividerX = scale(
    Math.log10(medianReach),
    minimumReach,
    maximumReach,
    8,
    92
  )

  const maxMomentum = Math.max(
    10,
    ...comparable.map(project => Math.abs(project.momentumPercent))
  )

  const points = comparable
    .map(project => ({
      ...project,
      quadrant: getQuadrant(
        project.reach,
        project.momentumPercent,
        medianReach
      ),
      x: scale(
        Math.log10(project.reach),
        minimumReach,
        maximumReach,
        8,
        92
      ),
      y: scale(project.momentumPercent, maxMomentum, -maxMomentum, 8, 92)
    }))
    .sort((left, right) => right.momentumPercent - left.momentumPercent)

  return {
    excludedCount: projects.length - comparable.length,
    maxMomentum,
    medianReach,
    points,
    reachDividerX
  }
}
