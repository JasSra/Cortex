/**
 * Formats a date as relative time (e.g., "2 mins ago", "1 hour ago", "3 days ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return 'Unknown'
  
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSecs < 60) {
    return diffSecs <= 5 ? 'Just now' : `${diffSecs} secs ago`
  } else if (diffMins < 60) {
    return diffMins === 1 ? '1 min ago' : `${diffMins} mins ago`
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  } else if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  } else if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
  } else {
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`
  }
}

/**
 * Formats a date with both relative time and absolute timestamp
 */
export function formatTimeWithTooltip(date: string | Date | null | undefined): { display: string; tooltip: string } {
  if (!date) return { display: 'Unknown', tooltip: 'Unknown time' }
  
  const absoluteTime = new Date(date).toLocaleString()
  const relativeTime = formatRelativeTime(date)
  
  return {
    display: relativeTime,
    tooltip: absoluteTime
  }
}
