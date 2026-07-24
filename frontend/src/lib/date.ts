/**
 * Formats a past (or, defensively, future-drifted) date as a short relative
 * string, e.g. "5 minutes ago", "2 hours ago", "3 days ago", or a plain date
 * once it's a week or older.
 */
export function formatRelativeDate(date: Date): string {
  const now = new Date()
  // Clamp to 0: a date in the client's future (server/client clock drift,
  // not just malformed input) would otherwise render as "-5 minutes ago".
  const diff = Math.max(0, now.getTime() - date.getTime())
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
