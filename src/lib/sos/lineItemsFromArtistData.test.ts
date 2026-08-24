import { describe, expect, it } from 'vitest'
import { monthToPeriodDate } from './lineItemsFromArtistData'

describe('monthToPeriodDate', () => {
  it('converts a valid YYYY-MM range', () => {
    expect(monthToPeriodDate('2026-01', false)).toBe('2026-01-01')
    expect(monthToPeriodDate('2026-02', true)).toBe('2026-02-28')
  })

  it('rejects impossible months instead of overflowing', () => {
    expect(monthToPeriodDate('2026-13', false)).toBeUndefined()
    expect(monthToPeriodDate('2026-00', true)).toBeUndefined()
    expect(monthToPeriodDate('Q1-2026', false)).toBeUndefined()
  })
})
