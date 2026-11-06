import { describe, expect, it } from 'vitest'
import { normalizeDateToMonth } from './normalizeDateToMonth'

describe('normalizeDateToMonth', () => {
  it('keeps ISO months', () => {
    expect(normalizeDateToMonth('2024-09')).toBe('2024-09')
    expect(normalizeDateToMonth('2024-09-01')).toBe('2024-09')
  })

  it('uses Believe DD/MM when both parts are ≤ 12', () => {
    expect(normalizeDateToMonth('01/09/2024', 'believe')).toBe('2024-09')
  })

  it('uses Bandcamp MM/DD when both parts are ≤ 12', () => {
    expect(normalizeDateToMonth('01/09/2024', 'bandcamp')).toBe('2024-01')
  })

  it('treats Shopify / Darkmerch as MM/DD and Printful as DD/MM', () => {
    expect(normalizeDateToMonth('01/09/2024', 'shopify')).toBe('2024-01')
    expect(normalizeDateToMonth('01/09/2024', 'darkmerch')).toBe('2024-01')
    expect(normalizeDateToMonth('01/09/2024', 'printful')).toBe('2024-09')
  })

  it('resolves unambiguous days regardless of source', () => {
    expect(normalizeDateToMonth('13/02/2024', 'believe')).toBe('2024-02')
    expect(normalizeDateToMonth('13/02/2024', 'bandcamp')).toBe('2024-02')
    expect(normalizeDateToMonth('02/13/2024', 'believe')).toBe('2024-02')
    expect(normalizeDateToMonth('02/13/2024', 'bandcamp')).toBe('2024-02')
  })

  it('rejects impossible calendar months and days rather than importing invalid periods', () => {
    expect(normalizeDateToMonth('2026-00')).toBe('')
    expect(normalizeDateToMonth('2026-13')).toBe('')
    expect(normalizeDateToMonth('2026-02-30')).toBe('')
    expect(normalizeDateToMonth('2026-12-11garbage')).toBe('')
    expect(normalizeDateToMonth('29/02/2025', 'believe')).toBe('')
    expect(normalizeDateToMonth('29/02/2024', 'believe')).toBe('2024-02')
  })

  it('does not silently override an explicitly confirmed date order', () => {
    expect(normalizeDateToMonth('13/02/2026', 'believe', 'month-first')).toBe('')
    expect(normalizeDateToMonth('04/05/2026', 'believe', 'month-first')).toBe('2026-04')
    expect(normalizeDateToMonth('04/05/2026', 'bandcamp', 'day-first')).toBe('2026-05')
    expect(normalizeDateToMonth('04/05/2026', 'believe', 'iso')).toBe('')
  })

  it('keeps 2-digit years American only for Bandcamp', () => {
    expect(normalizeDateToMonth('9/30/25 5:39pm', 'bandcamp')).toBe('2025-09')
    expect(normalizeDateToMonth('01/09/24', 'believe')).toBe('2024-09')
  })
})
