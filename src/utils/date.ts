/** Format a Date as YYYY-MM-DD using the local calendar (not UTC). */
export function localDateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Today's date in YYYY-MM-DD, local timezone. */
export function localToday(): string {
  return localDateString(new Date())
}
