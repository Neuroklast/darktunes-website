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

  it('keeps 2-digit years American only for Bandcamp', () => {
    expect(normalizeDateToMonth('9/30/25 5:39pm', 'bandcamp')).toBe('2025-09')
    expect(normalizeDateToMonth('01/09/24', 'believe')).toBe('2024-09')
  })
})
