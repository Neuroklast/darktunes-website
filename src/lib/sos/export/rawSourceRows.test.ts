import { describe, expect, it } from 'vitest'
import type { SalesTransaction } from '../ingest/csv-parser'
import {
  BELIEVE_RAW_DENIED_HEADERS,
  buildArtistRawSheets,
  stripDeniedSourceColumns,
} from './rawSourceRows'

describe('stripDeniedSourceColumns', () => {
  it('drops Believe gross + client-share columns and keeps Net Revenue', () => {
    const headers = [
      'Sales Month',
      'Platform',
      'Artist Name',
      'Gross revenue',
      'Client share rate',
      'Net Revenue',
    ]
    const rows = [['01/01/2026', 'Spotify', 'Reaper', '1.00', '0.85', '0.85']]
    const out = stripDeniedSourceColumns(headers, rows, 'believe')
    expect(out.headers).toEqual(['Sales Month', 'Platform', 'Artist Name', 'Net Revenue'])
    expect(out.rows[0]).toEqual(['01/01/2026', 'Spotify', 'Reaper', '0.85'])
  })

  it('does not strip Bandcamp columns', () => {
    const headers = ['date', 'artist', 'net amount', 'item name']
    const rows = [['01/01/2026', 'Reaper', '10', 'Hell']]
    expect(stripDeniedSourceColumns(headers, rows, 'bandcamp')).toEqual({ headers, rows })
  })
})

function makeTx(
  overrides: Partial<SalesTransaction> & { source_values: string[]; source_headers: string[] },
): SalesTransaction {
  return {
    id: 'row-1',
    source: 'believe',
    sales_month: '2026-01',
    platform: 'Spotify',
    country: 'DE',
    main_artist: 'Reaper',
    original_artist: 'Reaper',
    release_title: 'Hell',
    track_title: 'Hell',
    upc_ean: '1',
    isrc: 'DE',
    catalog_number: 'DTD',
    quantity: 1,
    net_revenue: 0.5,
    currency: 'EUR',
    is_physical: false,
    source_row_id: 'row-1',
    ...overrides,
  }
}

describe('buildArtistRawSheets', () => {
  it('builds Believe (margin stripped) and Bandcamp (all columns) for the same artist', () => {
    const believeHeaders = [
      'Sales Month',
      'Artist Name',
      'Gross revenue',
      'Client share rate',
      'Net Revenue',
    ]
    const sheets = buildArtistRawSheets([
      {
        artist: 'Reaper',
        transactions: [
          makeTx({
            source_headers: believeHeaders,
            source_values: ['01/01/2026', 'Reaper', '1.00', '0.85', '0.85'],
          }),
          makeTx({
            id: 'bc-1',
            source: 'bandcamp',
            source_row_id: 'bc-1',
            source_headers: ['date', 'artist', 'net amount'],
            source_values: ['01/01/2026', 'Reaper', '10'],
          }),
          makeTx({
            id: 'dm-1',
            source: 'darkmerch',
            source_row_id: 'dm-1',
            source_headers: ['DATE', 'BAND', 'NET REVENUE'],
            source_values: ['Q1 2026', 'Reaper', '5'],
          }),
        ],
      },
    ])

    const artistSheets = sheets.get('reaper') ?? []
    const believe = artistSheets.find((sheet) => sheet.source === 'believe')
    const bandcamp = artistSheets.find((sheet) => sheet.source === 'bandcamp')
    const darkmerch = artistSheets.find((sheet) => sheet.source === 'darkmerch')
    expect(believe?.sheetName).toBe('Believe')
    expect(believe?.headers).toEqual(['Sales Month', 'Artist Name', 'Net Revenue'])
    expect(believe?.rows).toEqual([['01/01/2026', 'Reaper', '0.85']])
    expect(bandcamp?.sheetName).toBe('Bandcamp')
    expect(bandcamp?.headers).toEqual(['date', 'artist', 'net amount'])
    expect(bandcamp?.rows).toEqual([['01/01/2026', 'Reaper', '10']])
    expect(darkmerch?.sheetName).toBe('Darkmerch')
    expect(darkmerch?.headers).toEqual(['DATE', 'BAND', 'NET REVENUE'])
    expect(darkmerch?.rows).toEqual([['Q1 2026', 'Reaper', '5']])
  })

  it('does not leak another band’s rows onto this artist’s sheet', () => {
    const headers = ['Artist Name', 'Net Revenue']
    const sheets = buildArtistRawSheets([
      {
        artist: 'Reaper',
        transactions: [
          makeTx({
            source_headers: headers,
            source_values: ['Reaper', '0.5'],
          }),
        ],
      },
      {
        artist: 'Lamori',
        transactions: [
          makeTx({
            id: 'lam-1',
            source_row_id: 'lam-1',
            main_artist: 'Lamori',
            original_artist: 'Lamori',
            source_headers: headers,
            source_values: ['Lamori', '9'],
          }),
        ],
      },
    ])

    expect(sheets.get('reaper')?.[0]?.rows).toEqual([['Reaper', '0.5']])
    expect(sheets.get('lamori')?.[0]?.rows).toEqual([['Lamori', '9']])
    expect(sheets.get('reaper')?.[0]?.rows.flat().join(' ')).not.toContain('Lamori')
  })

  it('dedupes track-assignment clones so the original line appears once', () => {
    const headers = ['Artist Name', 'Net Revenue']
    const sheets = buildArtistRawSheets([
      {
        artist: 'Reaper',
        transactions: [
          makeTx({
            id: 'row-1__split__Reaper',
            source_row_id: 'row-1',
            source_headers: headers,
            source_values: ['Reaper feat Other', '1.00'],
          }),
          makeTx({
            id: 'row-1__split__Other',
            source_row_id: 'row-1',
            source_headers: headers,
            source_values: ['Reaper feat Other', '1.00'],
          }),
        ],
      },
    ])

    expect(sheets.get('reaper')?.[0]?.rows).toHaveLength(1)
  })

  it('still emits Bandcamp when the artist has no Believe rows', () => {
    const sheets = buildArtistRawSheets([
      {
        artist: 'Reaper',
        transactions: [
          makeTx({
            source: 'bandcamp',
            source_headers: ['date', 'net amount'],
            source_values: ['01/01/2026', '10'],
          }),
        ],
      },
    ])
    expect(sheets.get('reaper')?.map((sheet) => sheet.source)).toEqual(['bandcamp'])
  })
})

describe('BELIEVE_RAW_DENIED_HEADERS', () => {
  it('covers official Believe margin columns immediately before Net Revenue', () => {
    expect(BELIEVE_RAW_DENIED_HEADERS).toEqual(
      expect.arrayContaining(['gross revenue', 'client share rate', 'client share']),
    )
  })
})
