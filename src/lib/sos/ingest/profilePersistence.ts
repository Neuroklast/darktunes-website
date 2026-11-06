import { z } from 'zod'

const financialFields = [
  'artistName', 'releaseTitle', 'trackTitle', 'quantity', 'netRevenue',
  'currency', 'salesMonth', 'platform', 'country', 'upcEan', 'isrc',
  'catalogNumber', 'releaseType', 'balanceEur', 'bandcampPackage',
] as const

const mapping = z.record(z.string().max(40), z.string().trim().max(128)).refine(
  (value) => Object.keys(value).every((key) => financialFields.includes(key as (typeof financialFields)[number])),
  'Unsupported financial field',
)

export const confirmedFinancialProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  type: z.literal('financial'),
  delimiter: z.enum([',', ';', '\t']),
  autoDetectHeaders: z.array(z.string().trim().min(1).max(128)).max(80),
  columnMapping: mapping,
  headerFingerprint: z.string().max(12_000).optional(),
  parserSource: z.enum(['believe', 'bandcamp', 'shopify', 'printful', 'darkmerch']).optional(),
  dateSemantics: z.enum(['sale-date', 'report-period', 'none']).optional(),
  dateOrder: z.enum(['day-first', 'month-first', 'iso']).optional(),
  amountConvention: z.enum(['de', 'en', 'auto']).optional(),
  revision: z.number().int().min(1).max(1_000_000).optional(),
  isSystemDefault: z.literal(false).optional(),
}).strict()

export const profileUpdateSchema = z.object({
  expected_revision: z.string().datetime({ offset: true }).nullable(),
  profiles: z.array(confirmedFinancialProfileSchema).max(100),
}).strict().refine(({ profiles }) =>
  new Set(profiles.map((p) => p.id)).size === profiles.length &&
  profiles.every((p) => !p.id.startsWith('system-') &&
    (p.dateSemantics !== 'report-period' || Boolean(p.columnMapping.salesMonth)) &&
    (p.parserSource !== 'shopify' && p.parserSource !== 'printful' && p.parserSource !== 'darkmerch' ||
      p.columnMapping.netRevenue !== undefined)),
  'Duplicate IDs, reserved system IDs or incomplete report profile',
)
