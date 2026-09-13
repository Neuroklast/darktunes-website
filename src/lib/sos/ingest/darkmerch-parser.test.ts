import { describe, expect, it } from 'vitest'
import { parseDarkmerchCSV } from './darkmerch-parser'

const CSV = ['DATE,BAND,NET REVENUE', 'Q1 2026,Reaper,5', 'Q1 2026,Lamori,8'].join('\n')

describe('parseDarkmerchCSV original cells', () => {
  it('keeps original headers and cell strings on each row', () => {
    const result = parseDarkmerchCSV(CSV)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]?.source_headers).toEqual(['DATE', 'BAND', 'NET REVENUE'])
    expect(result.transactions[0]?.source_values).toEqual(['Q1 2026', 'Reaper', '5'])
    expect(result.transactions[0]?.source_row_id).toBe(result.transactions[0]?.id)
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
