import { describe, expect, it } from 'vitest'
import { parseCSVContentStreaming } from './streaming-csv-parser'

const BELIEVE_HEADER = 'Artist,Release,Net Revenue,Currency,Sales Month'

describe('parseCSVContentStreaming skips', () => {
  it('records Bandcamp payout rows as skipped, not errors', async () => {
    const csv = [
      'item name,item type,net amount,currency,date',
      'Transfer,payout,50.00,EUR,01/09/2024',
      'Nightfall,digital,10.00,EUR,01/09/2024',
    ].join('\n')

    const result = await parseCSVContentStreaming(csv, 'bandcamp')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]?.net_revenue).toBe(10)
    expect(result.skipped.some((skip) => skip.reason === 'bandcamp-payout')).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('records no-artist zero-revenue rows as skipped', async () => {
    const csv = [
      BELIEVE_HEADER,
      ',Album,0,EUR,2024-03',
      'Neuroklast,Album,12.5,EUR,2024-03',
    ].join('\n')

    const result = await parseCSVContentStreaming(csv, 'believe')
    expect(result.transactions).toHaveLength(1)
    expect(result.skipped.some((skip) => skip.reason === 'no-artist-zero-revenue')).toBe(true)
  })

  it('records empty lines as skipped and keeps too-many-columns as an error', async () => {
    const csv = [
      BELIEVE_HEADER,
      '',
      'Neuroklast,Album,12.5,EUR,2024-03,extra,extra,extra,extra,extra,extra',
    ].join('\n')

    const result = await parseCSVContentStreaming(csv, 'believe')
    expect(result.skipped.some((skip) => skip.reason === 'empty-line')).toBe(true)
    expect(result.errors.some((error) => error.reason.includes('Too many columns'))).toBe(true)
  })

  it('counts empty currency cells as EUR warnings', async () => {
    const csv = [
      BELIEVE_HEADER,
      'Neuroklast,Album,12.5,,2024-03',
    ].join('\n')

    const result = await parseCSVContentStreaming(csv, 'believe')
    expect(result.transactions[0]?.currency).toBe('EUR')
    expect(result.emptyCurrencyRows).toBe(1)
  })

  it('keeps quoted embedded newlines inside one row', async () => {
    const csv = [
      BELIEVE_HEADER,
      '"Neuroklast","Album\nDeluxe",12.5,EUR,2024-03',
    ].join('\n')

    const result = await parseCSVContentStreaming(csv, 'believe')
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0]?.release_title).toContain('Album')
    expect(result.transactions[0]?.release_title).toContain('Deluxe')
    expect(result.transactions[0]?.net_revenue).toBe(12.5)
  })
})
