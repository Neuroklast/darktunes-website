import { describe, expect, it } from 'vitest'
import { estimateCsvRowCount, formatBytes, formatInteger, periodBoundsFromMonths } from './ingestProgress'

describe('ingestProgress helpers', () => {
  it('formats compact byte sizes', () => {
    expect(formatBytes(800)).toBe('800 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(68.4 * 1024 * 1024)).toMatch(/68\.4 MB/)
  })

  it('counts CSV data rows from newlines', () => {
    expect(estimateCsvRowCount('h1,h2\na,b\nc,d\n')).toBe(2)
    expect(estimateCsvRowCount('h1\na\nb')).toBe(2)
    expect(estimateCsvRowCount('')).toBe(0)
  })

  it('picks YYYY-MM bounds and ignores junk months', () => {
    expect(periodBoundsFromMonths(['2025-10', 'Unknown', '2026-03', '2025-12'])).toEqual({
      periodStart: '2025-10',
      periodEnd: '2026-03',
    })
  })

  it('formats integers with grouping', () => {
    expect(formatInteger(397003).replace(/[^\d]/g, '')).toBe('397003')
  })
})
