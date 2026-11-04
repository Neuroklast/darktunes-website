import { describe, expect, it } from 'vitest'
import { parseDarkmerchCSV, parseDarkmerchReportingPeriod } from './darkmerch-parser'

const CSV = ['DATE,BAND,NET REVENUE', 'Q1 2026,Reaper,5', 'Q1 2026,Lamori,8'].join('\n')

describe('parseDarkmerchCSV original cells', () => {
  it('keeps original headers and cell strings on each row', () => {
    const result = parseDarkmerchCSV(CSV)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]?.source_headers).toEqual(['DATE', 'BAND', 'NET REVENUE'])
    expect(result.transactions[0]?.source_values).toEqual(['Q1 2026', 'Reaper', '5'])
    expect(result.transactions[0]?.source_row_id).toBe(result.transactions[0]?.id)
    expect(result.transactions[0]?.source_headers).toBe(result.transactions[1]?.source_headers)
  })

  it('does not reuse row ids across two parses of the same file', () => {
    const first = parseDarkmerchCSV(CSV)
    const second = parseDarkmerchCSV(CSV)
    const firstIds = new Set(first.transactions.map((tx) => tx.id))
    for (const tx of second.transactions) {
      expect(firstIds.has(tx.id)).toBe(false)
    }
  })
})

describe('parseDarkmerchCSV number formats (#632)', () => {
  it('parses German decimal comma without a factor-100 error', () => {
    const csv = ['DATE;BAND;NET REVENUE', 'Q1 2026;Reaper;15,79', 'Q1 2026;Lamori;1.234,56'].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.transactions.map((tx) => tx.net_revenue)).toEqual([15.79, 1234.56])
    expect(result.errors).toHaveLength(0)
  })

  it('reports invalid revenue values instead of coercing them to 0', () => {
    const csv = ['DATE,BAND,NET REVENUE', 'Q1 2026,Reaper,12x', 'Q1 2026,Lamori,15.79'].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.transactions).toHaveLength(0)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]?.reason).toContain('NET REVENUE')
    expect(result.errors[0]?.reason).toContain('12x')
  })
})

describe('Darkmerch archive period metadata', () => {
  it('derives a complete quarter span without assigning artificial sale months', () => {
    const csv = [
      'DATE,BAND,NET REVENUE',
      'Q4 2025 - Q1 2026,Reaper,5',
      'Q4 2025 - Q1 2026,Lamori,8',
    ].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.periodStart).toBe('2025-10')
    expect(result.periodEnd).toBe('2026-03')
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions.every((tx) => tx.sales_month === '')).toBe(true)
    expect(result.transactions[0]?.release_title).toBe('Q4 2025 - Q1 2026')
  })

  it('detects shared-year quarter bounds in a five-column Darkmerch report', () => {
    const csv = [
      'DATE,ORDER NUMBER,BAND,,NET REVENUE',
      'Q2 - Q3 2026,,Band A,,10',
      'Q2 - Q3 2026,,Band B,,330',
    ].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result).toMatchObject({ periodStart: '2026-04', periodEnd: '2026-09' })
    expect(result.transactions.map((row) => row.net_revenue)).toEqual([10, 330])
    expect(result.transactions.every((row) => row.sales_month === '')).toBe(true)
    expect(result.transactions.every((row) => row.release_title === 'Q2 - Q3 2026')).toBe(true)
  })

  it('accepts shorthand dash variations and rejects reverse quarter ranges', () => {
    expect(parseDarkmerchReportingPeriod('Q2–Q3 2026')).toEqual({
      periodStart: '2026-04', periodEnd: '2026-09',
    })
    expect(parseDarkmerchReportingPeriod('Q2 — Q3 2026')).toEqual({
      periodStart: '2026-04', periodEnd: '2026-09',
    })
    expect(parseDarkmerchReportingPeriod('Q3 - Q2 2026')).toBeNull()
  })

  it('combines observed bounds across quarter and actual date rows', () => {
    const csv = [
      'DATE;BAND;NET REVENUE',
      'Q4 2025;Reaper;5',
      '2026-03-18;Lamori;10',
    ].join('\n')
    expect(parseDarkmerchCSV(csv)).toMatchObject({
      periodStart: '2025-10',
      periodEnd: '2026-03',
    })
    expect(parseDarkmerchReportingPeriod('Q1 2026')).toEqual({
      periodStart: '2026-01', periodEnd: '2026-03',
    })
  })

  it('does not fabricate a period from malformed or backwards labels', () => {
    expect(parseDarkmerchReportingPeriod('Q4 2026 - Q1 2025')).toBeNull()
    expect(parseDarkmerchReportingPeriod('Q5 2026')).toBeNull()
    expect(parseDarkmerchReportingPeriod('2026-02-30')).toBeNull()
    expect(parseDarkmerchCSV('DATE,BAND,NET REVENUE\nunknown,Reaper,5')).toMatchObject({
      periodStart: '', periodEnd: '',
    })
  })
})

describe('Darkmerch CSV quoting safety', () => {
  it('keeps quoted commas and escaped quotes in artist and period fields', () => {
    const csv = [
      'DATE,BAND,NET REVENUE',
      '"Q4 2025 - Q1 2026","Band, The ""Reapers""",15',
    ].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]?.original_artist).toBe('Band, The "Reapers"')
    expect(result.transactions[0]?.net_revenue).toBe(15)
    expect(result.periodStart).toBe('2025-10')
    expect(result.periodEnd).toBe('2026-03')
  })

  it('preserves quoted multiline artist cells and semicolon separated decimals', () => {
    const csv = ['DATE;BAND;NET REVENUE', 'Q1 2026;"The\nReapers";15,79'].join('\n')
    const result = parseDarkmerchCSV(csv)
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]?.original_artist).toBe('The\nReapers')
    expect(result.transactions[0]?.net_revenue).toBe(15.79)
  })

  it('rejects malformed quotes instead of calculating with shifted columns', () => {
    expect(() => parseDarkmerchCSV('DATE,BAND,NET REVENUE\nQ1 2026,"Invalid,5'))
      .toThrow(/Invalid Darkmerch CSV structure/)
  })
})
