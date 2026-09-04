/**
 * Money is always US dollars in both languages: the amount a customer owes
 * must not change shape with the interface language. Dates do localize.
 */
export function money(n: number): string {
  return Number(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function shortDate(d: string | null, locale = 'en-US'): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  })
}

export function daysAgo(d: string | null): number | null {
  if (!d) return null
  const then = new Date(d + 'T00:00:00').getTime()
  const now = new Date().setHours(0, 0, 0, 0)
  return Math.round((now - then) / 86400000)
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function plusDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
}
