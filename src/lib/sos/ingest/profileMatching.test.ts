import { describe, expect, it } from 'vitest'
import { DEFAULT_CSV_PROFILES } from './default-profiles'
import { matchProfile } from './parser-facade'
import { fingerprintHeaders } from './importSample'
import type { CsvImportProfile } from './types'

const saved: CsvImportProfile = {
  id: 'confirmed-1',
  name: 'Example',
  type: 'financial',
  delimiter: ';',
  autoDetectHeaders: ['Artist', 'Net Revenue', 'Date'],
  headerFingerprint: fingerprintHeaders(['Artist', 'Net Revenue', 'Date']),
  parserSource: 'believe',
  dateSemantics: 'sale-date',
  columnMapping: { artistName: 'Artist', netRevenue: 'Net Revenue', salesMonth: 'Date' },
}

describe('financial report format identification', () => {
  it('requires exact signature and delimiter for saved formats', () => {
    expect(matchProfile(['Date', 'Artist', 'Net Revenue'], [saved], ';')?.id).toBe(saved.id)
    expect(matchProfile(['Date', 'Artist', 'Net Revenue'], [saved], ',')).toBeNull()
    expect(matchProfile(['Date', 'Artist', 'Net Revenue', 'Fees'], [saved], ';')).toBeNull()
  })

  it('requires human resolution when two profiles share a signature', () => {
    expect(matchProfile(['Artist','Net Revenue','Date'], [saved, { ...saved, id:'confirmed-2' }], ';')).toBeNull()
  })

  it('does not match an old unconfirmed profile on two generic columns', () => {
    expect(matchProfile(['Artist', 'Net Revenue'], [{ ...saved, headerFingerprint: undefined }], ';')).toBeNull()
  })

  it('does not infer Darkmerch from merely an artist and net revenue column', () => {
    // Supplier attribution needs its distinctive order and date fields.
    expect(matchProfile(['BAND', 'NET REVENUE'], DEFAULT_CSV_PROFILES, ',')).toBeNull()
  })

  it('preserves matching well-known system profile formats', () => {
    expect(matchProfile(['DATE', 'ORDER NUMBER', 'BAND', 'NET REVENUE'], DEFAULT_CSV_PROFILES, ',')?.id).toBe('system-darkmerch')
  })
})
