/**
 * src/lib/sos/ingest/types.ts
 *
 * Domain types for the CSV Profile Engine.
 * Ported from sos-generator-for-mu/src/features/ingest/types/index.ts
 */

export type ProfileType = 'financial' | 'master-data'
export type ProfileDelimiter = ',' | ';'

export type FinancialFieldKey =
  | 'artistName'
  | 'releaseTitle'
  | 'trackTitle'
  | 'quantity'
  | 'netRevenue'
  | 'currency'
  | 'salesMonth'
  | 'platform'
  | 'country'
  | 'upcEan'
  | 'isrc'
  | 'catalogNumber'
  | 'releaseType'
  | 'balanceEur'
  | 'bandcampPackage'

export type MasterDataFieldKey =
  | 'name'
  | 'email'
  | 'vatNumber'
  | 'isEuNonGerman'
  | 'notes'
  | 'accountHolder'
  | 'iban'
  | 'bic'

export interface CsvImportProfile {
  id: string
  name: string
  type: ProfileType
  delimiter: ProfileDelimiter
  autoDetectHeaders: string[]
  columnMapping: Partial<Record<FinancialFieldKey | MasterDataFieldKey, string>>
  isSystemDefault?: boolean
  /** Exact structural signature for user-confirmed formats. */
  headerFingerprint?: string
}
