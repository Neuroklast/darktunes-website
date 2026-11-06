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

/** A malformed day or month must never enter financial reporting metadata. */
function checkedMonth(year: number, month: number, day: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
      month < 1 || month > 12 || day < 1 || day > 31) return ''
  const check = new Date(0)
  check.setUTCHours(0, 0, 0, 0)
  check.setUTCFullYear(year, month - 1, day)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/**
 * Converts a valid source sale date to a YYYY-MM key. If a user explicitly
 * selects DD/MM or MM/DD, the parser must not silently reverse that choice.
 * Ambiguous legacy dates without a profile retain source-specific behavior.
 */
export function normalizeDateToMonth(
  dateStr: string,
  source?: DateParseSource,
  dateOrder?: 'day-first' | 'month-first' | 'iso',
): string {
  if (!dateStr) return ''
  const s = dateStr.trim()
  if (!s) return ''

  const isoMatch = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?=$|T|\s)/.exec(s)
  if (isoMatch) {
    return checkedMonth(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3] ?? 1))
  }
  if (dateOrder === 'iso') return ''

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?=$|\s|T)/.exec(s)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    const rawYear = Number(slash[3])
    const year = rawYear < 100 ? 2000 + rawYear : rawYear
    if (dateOrder === 'month-first') return checkedMonth(year, a, b)
    if (dateOrder === 'day-first') return checkedMonth(year, b, a)
    if (b > 12) return checkedMonth(year, a, b)
    if (a > 12) return checkedMonth(year, b, a)
    if (rawYear < 100 && source === 'bandcamp') return checkedMonth(year, a, b)
    if (isMonthDaySource(source)) return checkedMonth(year, a, b)
    if (isDayMonthSource(source) || rawYear >= 100) return checkedMonth(year, b, a)
    return checkedMonth(year, a, b)
  }

  const dot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?=$|\s|T)/.exec(s)
  if (dot) {
    const dayFirst = dateOrder !== 'month-first'
    return checkedMonth(Number(dot[3]), Number(dayFirst ? dot[2] : dot[1]), Number(dayFirst ? dot[1] : dot[2]))
  }
  return ''
}
