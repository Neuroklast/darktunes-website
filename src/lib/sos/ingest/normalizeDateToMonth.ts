export type DateParseSource =
  | 'believe'
  | 'bandcamp'
  | 'shopify'
  | 'printful'
  | 'darkmerch'
  | 'manual'

function isDayMonthSource(source: DateParseSource | undefined): boolean {
  return source === 'believe' || source === 'printful'
}

function isMonthDaySource(source: DateParseSource | undefined): boolean {
  return source === 'bandcamp' || source === 'shopify' || source === 'darkmerch'
}

/**
 * Converts a CSV date string to a `YYYY-MM` month key.
 *
 * Unambiguous slash dates win regardless of source (`13/02/2024` → February,
 * `02/13/2024` → February). When both parts are ≤ 12 the source calendar
 * decides: Believe/Printful = DD/MM, Bandcamp/Shopify/Darkmerch = MM/DD.
 * A 2-digit year is American (MM/DD) only for Bandcamp.
 */
export function normalizeDateToMonth(
  dateStr: string,
  source?: DateParseSource,
): string {
  if (!dateStr) return ''
  const s = dateStr.trim()
  if (!s) return ''

  const isoMatch = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`

  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10)
    const b = parseInt(slashMatch[2], 10)
    const rawYear = parseInt(slashMatch[3], 10)
    const year = rawYear < 100 ? 2000 + rawYear : rawYear

    if (b > 12) {
      if (a >= 1 && a <= 12) return `${year}-${String(a).padStart(2, '0')}`
      return ''
    }
    if (a > 12) {
      if (b >= 1 && b <= 12) return `${year}-${String(b).padStart(2, '0')}`
      return ''
    }

    if (rawYear < 100 && source === 'bandcamp') {
      return `${year}-${String(a).padStart(2, '0')}`
    }

    if (isMonthDaySource(source)) {
      return `${year}-${String(a).padStart(2, '0')}`
    }
    if (isDayMonthSource(source) || rawYear >= 100) {
      if (b >= 1 && b <= 12) return `${year}-${String(b).padStart(2, '0')}`
      return ''
    }

    if (a >= 1 && a <= 12) return `${year}-${String(a).padStart(2, '0')}`
    return ''
  }

  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dotMatch) {
    const year = parseInt(dotMatch[3], 10)
    const month = parseInt(dotMatch[2], 10)
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`
    }
  }

  return ''
}
