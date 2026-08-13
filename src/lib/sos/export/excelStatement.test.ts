import { describe, expect, it } from 'vitest'
import type { SafeProcessedArtistData } from '../types'
import {
  DEFAULT_EXCEL_EXPORT_SETTINGS,
  normalizeExcelExportSettings,
} from '../excelExportSettings'
import { generateExcel } from './excelStatement'

function makeArtist(overrides: Partial<SafeProcessedArtistData> = {}): SafeProcessedArtistData {
  return {
    artist: 'Neuroklast',
    believeRevenue: 10,
    bandcampRevenue: 20,
    darkmerchRevenue: 5,
    totalDigitalRevenue: 30,
    totalPhysicalRevenue: 8,
    totalDownloadRevenue: 4,
    totalStreamRevenue: 26,
    manualRevenue: 0,
    manualRevenueEntries: [],
    grossRevenue: 43,
    splitPercentage: 50,
    finalPayout: 21.5,
    totalQuantity: 3,
    totalExpenses: 0,
    expenseEntries: [],
    distributionFeeDeducted: 0,
    platformBreakdown: [{ platform: 'Spotify', revenue: 26, quantity: 100, streamQuantity: 100 }],
    countryBreakdown: [{ country: 'DE', revenue: 26, quantity: 100 }],
    monthlyBreakdown: [{ month: '2026-01', revenue: 26 }],
    releaseBreakdown: [
      {
        releaseTitle: 'Nightfall',
        upcEan: '123',
        catalogNumber: 'DT001',
        revenue: 30,
        quantity: 2,
        isPhysical: false,
      },
      {
        releaseTitle: 'Sampler Hits',
        upcEan: '999',
        catalogNumber: 'COMP1',
        revenue: 1,
        quantity: 1,
        isPhysical: false,
      },
    ],
    physicalReleasesRevenue: 8,
    digitalRevenueAfterFee: 30,
    believeDigitalRevenueAfterFee: 10,
    bandcampDigitalRevenueAfterFee: 20,
    otherDigitalRevenueAfterFee: 0,
    physicalReleasesRevenueAfterFee: 8,
    darkmerchRevenueAfterFee: 5,
    digitalSplitPercentage: 50,
    believeSplitPercentage: 50,
    bandcampSplitPercentage: 50,
    physicalSplitPercentage: 50,
    darkmerchSplitPercentage: 50,
    ...overrides,
  }
}

async function sheetRows(blob: Blob, name: string): Promise<Array<Array<string | number>>> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.getWorksheet(name)
  if (!sheet) return []
  const rows: Array<Array<string | number>> = []
  sheet.eachRow((row) => {
    const values = (row.values as Array<string | number | undefined>).slice(1)
    rows.push(values.map((value) => (value == null ? '' : value)))
  })
  return rows
}

const label = { name: 'darkTunes', address: 'Berlin' }

describe('generateExcel column filters', () => {
  it('always writes artist, period, and final payout', { timeout: 20_000 }, async () => {
    const blob = await generateExcel(
      makeArtist(),
      label,
      '2026-01',
      '2026-03',
      [],
      normalizeExcelExportSettings({
        columns: {
          'summary.believeRevenue': false,
          'summary.bandcampRevenue': false,
        },
      }),
    )
    const summary = await sheetRows(blob, 'Summary')
    const labels = summary.map((row) => String(row[0]))
    expect(labels).toContain('Artist')
    expect(labels).toContain('Period')
    expect(labels).toContain('Final Payout')
    expect(labels).not.toContain('Believe Revenue')
    expect(labels).not.toContain('Bandcamp Revenue')
  })

  it('omits disabled release columns', async () => {
    const blob = await generateExcel(
      makeArtist(),
      label,
      '2026-01',
      '2026-03',
      [],
      normalizeExcelExportSettings({
        columns: { 'releases.upcEan': false, 'releases.catalogNumber': false },
      }),
    )
    const releases = await sheetRows(blob, 'Releases')
    expect(releases[0]).toEqual(['Release Title', 'Revenue', 'Quantity', 'Type'])
    expect(releases[1]?.[0]).toBe('Nightfall')
    expect(releases[1]).not.toContain('123')
  })

  it('omits a whole sheet when it is turned off', async () => {
    const blob = await generateExcel(
      makeArtist(),
      label,
      '2026-01',
      '2026-03',
      [],
      normalizeExcelExportSettings({ sheets: { monthly: false, countries: false } }),
    )
    expect(await sheetRows(blob, 'Monthly')).toEqual([])
    expect(await sheetRows(blob, 'Countries')).toEqual([])
    expect((await sheetRows(blob, 'Platforms'))[0]).toEqual(['Platform', 'Revenue', 'Quantity'])
  })

  it('hides compilation releases when the setting is on', async () => {
    const blob = await generateExcel(
      makeArtist(),
      label,
      '2026-01',
      '2026-03',
      [{ id: 'c1', type: 'ean', identifier: '999', label: 'Sampler' }],
      DEFAULT_EXCEL_EXPORT_SETTINGS,
    )
    const releases = await sheetRows(blob, 'Releases')
    const titles = releases.slice(1).map((row) => row[0])
    expect(titles).toContain('Nightfall')
    expect(titles).not.toContain('Sampler Hits')
  })
})
