/** Validate untrusted AI profile suggestions, never financial rows. */
import { ApiError } from '@/lib/errors'

export const fieldKeys = [
  'artist_name', 'net_revenue', 'sales_month', 'release_title',
  'track_title', 'quantity', 'currency', 'platform', 'country',
  'isrc', 'upc_ean', 'catalog_number', 'release_type',
] as const

/**
 * Never trust model-generated field names or mappings. Mapping columns must
 * exist in the exact, caller-supplied header row. No financial values can be
 * changed by this endpoint.
 */
export function validateProfileSuggestion(
  raw: unknown,
  headers: string[],
): {
  profile_name: string
  field_mapping: Record<string, string>
  explanation: string
  question: string | null
  parser_source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch' | null
  date_semantics: 'sale-date' | 'report-period' | 'none' | null
  date_order: 'day-first' | 'month-first' | 'iso' | null
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError(422, 'The AI returned no valid mapping. Select columns manually.', 'AI_MAPPING_INVALID')
  }
  const candidate = raw as Record<string, unknown>
  const mappings = candidate.field_mapping
  const fieldMapping: Record<string, string> = {}
  if (mappings && typeof mappings === 'object' && !Array.isArray(mappings)) {
    for (const [key, value] of Object.entries(mappings)) {
      if (!fieldKeys.includes(key as (typeof fieldKeys)[number]) || typeof value !== 'string') continue
      const column = headers.find((h) => h === value)
      if (column && !Object.values(fieldMapping).includes(column)) fieldMapping[key] = column
    }
  }
  const question = typeof candidate.question === 'string'
    ? candidate.question.trim().slice(0, 280) || null : null
  return {
    profile_name: typeof candidate.profile_name === 'string'
      ? candidate.profile_name.trim().slice(0, 80) || 'Imported financial report'
      : 'Imported financial report',
    field_mapping: fieldMapping,
    explanation: typeof candidate.explanation === 'string'
      ? candidate.explanation.trim().slice(0, 350) : '',
    question,
    parser_source: ['believe','bandcamp','shopify','printful','darkmerch'].includes(String(candidate.parser_source))
      ? candidate.parser_source as 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch' : null,
    date_semantics: ['sale-date','report-period','none'].includes(String(candidate.date_semantics))
      ? candidate.date_semantics as 'sale-date' | 'report-period' | 'none' : null,
    date_order: ['day-first','month-first','iso'].includes(String(candidate.date_order))
      ? candidate.date_order as 'day-first' | 'month-first' | 'iso' : null,
  }
}

