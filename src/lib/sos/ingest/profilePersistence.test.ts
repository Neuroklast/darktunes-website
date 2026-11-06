import { describe, expect, it } from 'vitest'
import { profileUpdateSchema } from './profilePersistence'

const base = {
  id: 'sample-1', name: 'Custom Report', type: 'financial' as const,
  delimiter: ',' as const, autoDetectHeaders: ['Artist', 'Net Revenue', 'Date'],
  columnMapping: { artistName: 'Artist', netRevenue: 'Net Revenue', salesMonth: 'Date' },
  parserSource: 'believe' as const, dateSemantics: 'sale-date' as const,
  dateOrder: 'day-first' as const, revision: 1,
}

describe('global CSV profile validation', () => {
  it('accepts a user-confirmed profile and CAS revision', () => {
    expect(profileUpdateSchema.parse({ expected_revision: null, profiles: [base] }).profiles[0].id).toBe('sample-1')
  })
  it('rejects duplicate profiles and reserved system IDs', () => {
    expect(profileUpdateSchema.safeParse({ expected_revision: null, profiles: [base, base] }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ expected_revision: null, profiles: [{...base, id:'system-believe'}] }).success).toBe(false)
  })
  it('rejects unknown financial mappings and incomplete reporting-period metadata', () => {
    expect(profileUpdateSchema.safeParse({
      expected_revision: null, profiles: [{ ...base, columnMapping: { __unsafe: 'X' } }],
    }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({
      expected_revision: null, profiles: [{ ...base, dateSemantics: 'report-period', columnMapping: { artistName: 'Artist' } }],
    }).success).toBe(false)
  })
})
