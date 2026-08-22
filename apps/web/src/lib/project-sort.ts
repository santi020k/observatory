export interface ProjectSortRecord {
  downloads: number
  growthChange: number
  growthPriority: number
  name: string
  relevance: number
  stars: number
  updated: number
}

export type ProjectSort =
  | 'downloads' |
  'momentum' |
  'name' |
  'relevance' |
  'stars' |
  'updated'

const compareNumberDescending = (left: number, right: number): number => right - left

export const compareProjectSortRecords = (
  left: ProjectSortRecord,
  right: ProjectSortRecord,
  sort: string
): number => {
  if (sort === 'name') return left.name.localeCompare(right.name)

  if (sort === 'momentum')
    return (
      compareNumberDescending(left.growthPriority, right.growthPriority) ||
      compareNumberDescending(left.growthChange, right.growthChange) ||
      compareNumberDescending(left.stars, right.stars)
    )

  if (sort === 'downloads')
    return compareNumberDescending(left.downloads, right.downloads)

  if (sort === 'stars')
    return compareNumberDescending(left.stars, right.stars)

  if (sort === 'updated')
    return compareNumberDescending(left.updated, right.updated)

  return compareNumberDescending(left.relevance, right.relevance)
}
