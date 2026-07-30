const numberFormatter = new Intl.NumberFormat('en', {
  maximumFractionDigits: 1,
  notation: 'compact'
})

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export const formatNumber = (value: number | null): string => value === null ? 'Connect GitHub' : numberFormatter.format(value)

export const formatDate = (value: string | null): string => {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value))
}

export const formatRelativeDate = (value: string | null): string => {
  if (!value) return 'No activity'

  const days = Math.round(
    (Date.parse(value) - Date.now()) / (24 * 60 * 60 * 1000)
  )

  if (Math.abs(days) < 30) return relativeFormatter.format(days, 'day')

  const months = Math.round(days / 30)

  return relativeFormatter.format(months, 'month')
}

export const formatDuration = (value: number | null): string => value === null ? 'Not checked' : `${value.toLocaleString()} ms`
