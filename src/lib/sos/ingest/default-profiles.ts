/**
 * default-profiles.ts
 *
 * Pre-populated system CsvImportProfiles shipped with the application.
 * These are always available and serve as the initial state for the profile
 * store. They are marked `isSystemDefault: true` so the UI can render them
 * with a lock indicator.
 *
 * IMPORTANT: Do not change the `id` fields — they are used as stable
 * identifiers in parser routing logic (e.g. SYSTEM_BANDCAMP_PROFILE_ID).
 */
import type { CsvImportProfile, FinancialFieldKey } from './types'

// ── Stable IDs for system profiles ───────────────────────────────────────────

export const SYSTEM_BANDCAMP_PROFILE_ID = 'system-bandcamp'
export const SYSTEM_BANDCAMP_DDS_PROFILE_ID = 'system-bandcamp-dds'
export const SYSTEM_BELIEVE_PROFILE_ID = 'system-believe'
export const SYSTEM_SHOPIFY_PROFILE_ID = 'system-shopify'
export const SYSTEM_PRINTFUL_PROFILE_ID = 'system-printful'
export const SYSTEM_DARKMERCH_PROFILE_ID = 'system-darkmerch'
/** @deprecated Artist roster is loaded from the portal DB — not from CSV. */
export const SYSTEM_LABEL_ARTISTS_PROFILE_ID = 'system-label-artists'

// ── Internal field key → streaming-parser internal field name mapping ─────────

/**
 * Translates a `FinancialFieldKey` (our profile schema) to the snake_case
 * field name used internally by the streaming CSV parser and SalesTransaction.
 *
 * This map is the single source of truth for the key translation. Any new
 * financial field must be added here.
 */
export const FINANCIAL_KEY_TO_INTERNAL: Readonly<Record<FinancialFieldKey, string>> = {
  artistName:      'original_artist',
  releaseTitle:    'release_title',
  trackTitle:      'track_title',
  quantity:        'quantity',
  netRevenue:      'net_revenue',
  currency:        'currency',
  salesMonth:      'sales_month',
  platform:        'platform',
  country:         'country',
  upcEan:          'upc_ean',
  isrc:            'isrc',
  catalogNumber:   'catalog_number',
  releaseType:     'release_type',
  balanceEur:      'balance_eur',
  /** Maps the "package" CSV column to the internal bandcamp_package field. */
  bandcampPackage: 'bandcamp_package',
}

// ── System default profiles ───────────────────────────────────────────────────

const BANDCAMP_DDS_PAYOUTS: CsvImportProfile = {
  parserSource: 'bandcamp',
  dateSemantics: 'sale-date',
  dateOrder: 'month-first',
  id: SYSTEM_BANDCAMP_DDS_PROFILE_ID,
  name: 'Bandcamp DDS / Darktunes Payouts',
  type: 'financial',
  delimiter: ',',
  autoDetectHeaders: ['payout date', 'paid to you', 'bandcamp id', 'item date', 'item type'],
  columnMapping: {
    salesMonth:   'item date',
    releaseTitle: 'description',
    trackTitle:   'description',
    netRevenue:   'paid to you',
    releaseType:  'item type',
    upcEan:       'upc',
    isrc:         'isrc',
    country:      'buyer country',
  },
  isSystemDefault: true,
}

const BANDCAMP_STANDARD: CsvImportProfile = {
  parserSource: 'bandcamp',
  dateSemantics: 'sale-date',
  dateOrder: 'month-first',
  id: SYSTEM_BANDCAMP_PROFILE_ID,
  name: 'Bandcamp Standard',
  type: 'financial',
  delimiter: ',',
  autoDetectHeaders: ['date', 'paid to', 'item type', 'item name', 'artist'],
  columnMapping: {
    salesMonth:      'date',
    artistName:      'artist',
    releaseTitle:    'item name',
    // Revenue: "net amount" is the per-transaction label payout after Bandcamp fees.
    // "balance of revenue share (EUR)" (balanceEur) is the collection-society running
    // balance — NOT per-transaction revenue — and is therefore intentionally excluded
    // from this profile. The balanceEur FinancialFieldKey is retained for backward
    // compatibility with user-defined profiles that may reference it.
    netRevenue:      'net amount',
    releaseType:     'item type',
    catalogNumber:   'catalog number',
    currency:        'currency',
    country:         'country',
    /** "package" column: identifies digital downloads vs physical products. */
    bandcampPackage: 'package',
  },
  isSystemDefault: true,
}

const BELIEVE_DIGITAL: CsvImportProfile = {
  parserSource: 'believe',
  dateSemantics: 'sale-date',
  dateOrder: 'day-first',
  id: SYSTEM_BELIEVE_PROFILE_ID,
  name: 'Believe Digital',
  type: 'financial',
  delimiter: ';',
  autoDetectHeaders: ['Believe Sales Month', 'Sales Month', 'Platform', 'Artist Name', 'Net Revenue'],
  columnMapping: {
    salesMonth:    'Believe Sales Month',
    platform:      'Platform',
    country:       'Country/Region',
    artistName:    'Artist Name',
    releaseTitle:  'Release title',
    trackTitle:    'Track title',
    isrc:          'ISRC',
    upcEan:        'UPC/EAN',
    catalogNumber: 'Release Catalog nb',
    netRevenue:    'Net Revenue',
    currency:      'Currency',
    releaseType:   'Release Type',
    quantity:      'Quantity',
  },
  isSystemDefault: true,
}

const SHOPIFY_ORDERS: CsvImportProfile = {
  parserSource: 'shopify',
  dateSemantics: 'sale-date',
  dateOrder: 'month-first',
  id: SYSTEM_SHOPIFY_PROFILE_ID,
  name: 'Shopify Orders',
  type: 'financial',
  delimiter: ',',
  autoDetectHeaders: ['Name', 'Email', 'Financial Status', 'Paid at', 'Fulfillment Status'],
  columnMapping: {
    salesMonth:   'Paid at',
    netRevenue:   'Total',
    currency:     'Currency',
    releaseTitle: 'Lineitem name',
    quantity:     'Lineitem quantity',
  },
  isSystemDefault: true,
}

const PRINTFUL_COSTS: CsvImportProfile = {
  parserSource: 'printful',
  dateSemantics: 'sale-date',
  dateOrder: 'day-first',
  id: SYSTEM_PRINTFUL_PROFILE_ID,
  name: 'Printful Costs',
  type: 'financial',
  delimiter: ',',
  autoDetectHeaders: ['Order', 'Status', 'Total', 'Date', 'Address'],
  columnMapping: {
    salesMonth:   'Date',
    netRevenue:   'Total',
    releaseTitle: 'Order',
    releaseType:  'Status',
  },
  isSystemDefault: true,
}

const DARKMERCH_ORDERS: CsvImportProfile = {
  parserSource: 'darkmerch',
  dateSemantics: 'report-period',
  dateOrder: 'iso',
  id: SYSTEM_DARKMERCH_PROFILE_ID,
  name: 'Darkmerch Orders',
  type: 'financial',
  delimiter: ',',
  autoDetectHeaders: ['DATE', 'ORDER NUMBER', 'BAND', 'NET REVENUE'],
  columnMapping: {
    salesMonth:  'DATE',
    artistName:  'BAND',
    netRevenue:  'NET REVENUE',
    releaseType: 'ORDER NUMBER',
  },
  isSystemDefault: true,
}

/** All system default profiles in priority order for auto-detection.
 * Artist master data is intentionally excluded — SOS uses the portal artist roster + billing profiles. */
export const DEFAULT_CSV_PROFILES: CsvImportProfile[] = [
  BELIEVE_DIGITAL,
  BANDCAMP_DDS_PAYOUTS,
  BANDCAMP_STANDARD,
  DARKMERCH_ORDERS,
  SHOPIFY_ORDERS,
  PRINTFUL_COSTS,
]
