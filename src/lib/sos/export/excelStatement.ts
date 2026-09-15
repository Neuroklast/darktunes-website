import type {
  CompilationFilter,
  LabelInfo,
  PdfExportSettings,
  ReleaseRevenue,
  SafeProcessedArtistData,
} from '../types'
import {
  enabledColumnsForSheet,
  isExcelSheetEnabled,
  normalizeExcelExportSettings,
  type ExcelColumnId,
  type ExcelExportSettings,
  type ExcelExportSettingsPatch,
} from '../excelExportSettings'
import { excelSafeSheetName, type ArtistRawSourceSheet } from './rawSourceRows'
import { DEFAULT_PDF_SETTINGS, isCompilationRelease } from './shared'

type ExcelGenerateSettings = ExcelExportSettingsPatch | Partial<PdfExportSettings>

function isExcelExportSettings(
  settings: ExcelGenerateSettings | undefined,
): settings is ExcelExportSettingsPatch {
  return !!settings && ('sheets' in settings || 'columns' in settings)
}

export function resolveExcelGenerateSettings(
  settings?: ExcelGenerateSettings,
): ExcelExportSettings {
  if (isExcelExportSettings(settings)) {
    return normalizeExcelExportSettings(settings)
  }
  return normalizeExcelExportSettings({
    hideCompilationsInStatement:
      settings?.hideCompilationsInStatement ??
      DEFAULT_PDF_SETTINGS.hideCompilationsInStatement,
  })
}

/**
 * Generates an Excel statement workbook for one artist.
 */
export interface ExcelRawWriteProgress {
  sheet: string
  written: number
  total: number
}

/** Rows per addRows call — large enough to be fast, small enough to yield. */
export const RAW_SHEET_WRITE_BATCH = 400

const EXCEL_MAX_DATA_ROWS = 1_000_000

export async function generateExcel(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  compilationFilters: CompilationFilter[] = [],
  settings?: ExcelGenerateSettings,
  rawSheets: ArtistRawSourceSheet[] = [],
  onRawProgress?: (progress: ExcelRawWriteProgress) => void,
): Promise<Blob> {
  try {
    return await buildExcel(
      artistData,
      labelInfo,
      periodStart,
      periodEnd,
      compilationFilters,
      settings,
      rawSheets,
      onRawProgress,
    )
  } catch (err) {
    throw new Error(
      `Excel generation failed for "${artistData.artist}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

type SummaryRow = [string, string | number]

const SUMMARY_METRIC_ROWS: Array<{
  id: ExcelColumnId
  build: (artistData: SafeProcessedArtistData) => SummaryRow[]
}> = [
  { id: 'summary.believeRevenue', build: (data) => [['Believe Revenue', data.believeRevenue]] },
  { id: 'summary.bandcampRevenue', build: (data) => [['Bandcamp Revenue', data.bandcampRevenue]] },
  { id: 'summary.darkmerchRevenue', build: (data) => [['Darkmerch Revenue', data.darkmerchRevenue]] },
  { id: 'summary.streamingRevenue', build: (data) => [['Streaming Revenue', data.totalStreamRevenue]] },
  { id: 'summary.downloadRevenue', build: (data) => [['Download Revenue', data.totalDownloadRevenue]] },
  { id: 'summary.digitalRevenue', build: (data) => [['Digital Revenue (Total)', data.totalDigitalRevenue]] },
  { id: 'summary.physicalRevenue', build: (data) => [['Physical Revenue', data.totalPhysicalRevenue]] },
  { id: 'summary.manualRevenue', build: (data) => [['Manual Revenue', data.manualRevenue]] },
  { id: 'summary.grossRevenue', build: (data) => [['Gross Revenue', data.grossRevenue]] },
  {
    id: 'summary.digitalSplits',
    build: (data) => {
      const digitalFallbackSplit = data.digitalSplitPercentage
      const includeBelieveDigitalSplit =
        data.believeSplitPercentage !== digitalFallbackSplit || data.believeRevenue > 0
      const includeBandcampDigitalSplit =
        data.bandcampSplitPercentage !== digitalFallbackSplit || data.bandcampRevenue > 0
      const rows: SummaryRow[] = []
      if (includeBelieveDigitalSplit) {
        rows.push(['Artist Split – Believe Digital (%)', data.believeSplitPercentage])
      }
      if (includeBandcampDigitalSplit) {
        rows.push(['Artist Split – Bandcamp Digital (%)', data.bandcampSplitPercentage])
      }
      rows.push(['Artist Split – Other Digital (%)', digitalFallbackSplit])
      return rows
    },
  },
  {
    id: 'summary.physicalSplit',
    build: (data) => [['Artist Split – Physical Releases (%)', data.physicalSplitPercentage]],
  },
  {
    id: 'summary.darkmerchSplit',
    build: (data) => [['Artist Split – Merchandise/Darkmerch (%)', data.darkmerchSplitPercentage]],
  },
  { id: 'summary.openingBalance', build: (data) => [['Opening Balance', data.openingBalanceEur ?? 0]] },
  { id: 'summary.amountDue', build: (data) => [['Amount Due', data.amountDueEur ?? data.finalPayout]] },
]

const RELEASE_COLUMNS: Array<{
  id: ExcelColumnId
  header: string
  width: number
  value: (release: ReleaseRevenue) => string | number
}> = [
  { id: 'releases.title', header: 'Release Title', width: 35, value: (r) => r.releaseTitle || '' },
  { id: 'releases.upcEan', header: 'UPC/EAN', width: 15, value: (r) => r.upcEan || '' },
  { id: 'releases.catalogNumber', header: 'Catalog Number', width: 15, value: (r) => r.catalogNumber || '' },
  { id: 'releases.revenue', header: 'Revenue', width: 15, value: (r) => r.revenue },
  { id: 'releases.quantity', header: 'Quantity', width: 10, value: (r) => r.quantity },
  { id: 'releases.type', header: 'Type', width: 10, value: (r) => (r.isPhysical ? 'Physical' : 'Digital') },
]

const PLATFORM_COLUMNS: Array<{
  id: ExcelColumnId
  header: string
  width: number
  value: (row: SafeProcessedArtistData['platformBreakdown'][number]) => string | number
}> = [
  { id: 'platforms.platform', header: 'Platform', width: 25, value: (row) => row.platform || 'Unknown' },
  { id: 'platforms.revenue', header: 'Revenue', width: 15, value: (row) => row.revenue },
  { id: 'platforms.quantity', header: 'Quantity', width: 10, value: (row) => row.quantity },
]

const COUNTRY_COLUMNS: Array<{
  id: ExcelColumnId
  header: string
  width: number
  value: (row: SafeProcessedArtistData['countryBreakdown'][number]) => string | number
}> = [
  { id: 'countries.country', header: 'Country', width: 20, value: (row) => row.country || 'Unknown' },
  { id: 'countries.revenue', header: 'Revenue', width: 15, value: (row) => row.revenue },
  { id: 'countries.quantity', header: 'Quantity', width: 10, value: (row) => row.quantity },
]

const MONTHLY_COLUMNS: Array<{
  id: ExcelColumnId
  header: string
  width: number
  value: (row: SafeProcessedArtistData['monthlyBreakdown'][number]) => string | number
}> = [
  { id: 'monthly.month', header: 'Month', width: 12, value: (row) => row.month },
  { id: 'monthly.revenue', header: 'Revenue', width: 15, value: (row) => row.revenue },
]

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function writeRawSheet(
  workbook: import('exceljs').Workbook,
  sourceSheet: ArtistRawSourceSheet,
  onRawProgress?: (progress: ExcelRawWriteProgress) => void,
): Promise<void> {
  if (sourceSheet.headers.length === 0) return

  const chunks: Array<{ name: string; rows: string[][] }> = []
  for (let offset = 0; offset < sourceSheet.rows.length; offset += EXCEL_MAX_DATA_ROWS) {
    const slice = sourceSheet.rows.slice(offset, offset + EXCEL_MAX_DATA_ROWS)
    const suffix = offset === 0 ? '' : `_${Math.floor(offset / EXCEL_MAX_DATA_ROWS) + 1}`
    chunks.push({
      name: excelSafeSheetName(`${sourceSheet.sheetName}${suffix}`),
      rows: slice,
    })
  }
  if (chunks.length === 0) {
    chunks.push({ name: excelSafeSheetName(sourceSheet.sheetName), rows: [] })
  }

  for (const chunk of chunks) {
    const worksheet = workbook.addWorksheet(chunk.name)
    worksheet.columns = sourceSheet.headers.map((header) => ({
      width: Math.min(36, Math.max(14, header.length + 4)),
    }))
    worksheet.addRow(sourceSheet.headers)
    worksheet.getRow(1).font = { bold: true }

    const total = chunk.rows.length
    for (let i = 0; i < total; i += RAW_SHEET_WRITE_BATCH) {
      const batch = chunk.rows.slice(i, i + RAW_SHEET_WRITE_BATCH)
      worksheet.addRows(batch)
      const written = Math.min(i + batch.length, total)
      onRawProgress?.({ sheet: chunk.name, written, total })
      if (total > RAW_SHEET_WRITE_BATCH) {
        await yieldToEventLoop()
      }
    }

    const lastRow = Math.max(1, total + 1)
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastRow, column: sourceSheet.headers.length },
    }
  }
}

async function buildExcel(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  compilationFilters: CompilationFilter[] = [],
  settings?: ExcelGenerateSettings,
  rawSheets: ArtistRawSourceSheet[] = [],
  onRawProgress?: (progress: ExcelRawWriteProgress) => void,
): Promise<Blob> {
  const excelSettings = resolveExcelGenerateSettings(settings)
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()

  if (isExcelSheetEnabled(excelSettings, 'summary')) {
    const enabledMetrics = new Set(enabledColumnsForSheet(excelSettings, 'summary'))
    const summaryData: Array<Array<string | number>> = [
      ['Statement of Sales'],
      [],
      ['Label', labelInfo.name || ''],
      ['Address', labelInfo.address || ''],
      [],
      ['Artist', artistData.artist],
      ['Period', periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : ''],
      [],
      ['Revenue Summary'],
    ]

    for (const metric of SUMMARY_METRIC_ROWS) {
      if (enabledMetrics.has(metric.id)) {
        summaryData.push(...metric.build(artistData))
      }
    }
    summaryData.push(['Period Payout', artistData.finalPayout])
    summaryData.push(['Opening Balance', artistData.openingBalanceEur ?? 0])
    summaryData.push(['Amount Due', artistData.amountDueEur ?? artistData.finalPayout])
    if (isExcelSheetEnabled(excelSettings, 'raw')) {
      summaryData.push([])
      summaryData.push(['Original reports'])
      summaryData.push([
        'Believe, Bandcamp and Darkmerch tabs list unaggregated distributor line items for this artist only.',
      ])
      summaryData.push([
        'Believe distributor commission / client-share columns are omitted. Net Revenue is the amount received by the label.',
      ])
    }

    const summarySheet = workbook.addWorksheet('Summary')
    summarySheet.columns = [{ width: 38 }, { width: 25 }]
    summarySheet.addRows(summaryData)
    summarySheet.getCell('A1').font = { bold: true, size: 14 }
  }

  const shouldHideCompilations = excelSettings.hideCompilationsInStatement
  const releaseBreakdown = shouldHideCompilations
    ? artistData.releaseBreakdown.filter((rel) => !isCompilationRelease(rel, compilationFilters))
    : artistData.releaseBreakdown
  const releaseCols = RELEASE_COLUMNS.filter((col) =>
    enabledColumnsForSheet(excelSettings, 'releases').includes(col.id),
  )
  if (isExcelSheetEnabled(excelSettings, 'releases') && releaseBreakdown.length > 0 && releaseCols.length > 0) {
    const releaseSheet = workbook.addWorksheet('Releases')
    releaseSheet.columns = releaseCols.map((col) => ({ width: col.width }))
    releaseSheet.addRow(releaseCols.map((col) => col.header))
    for (const release of releaseBreakdown) {
      releaseSheet.addRow(releaseCols.map((col) => col.value(release)))
    }
  }

  const platformCols = PLATFORM_COLUMNS.filter((col) =>
    enabledColumnsForSheet(excelSettings, 'platforms').includes(col.id),
  )
  if (
    isExcelSheetEnabled(excelSettings, 'platforms') &&
    artistData.platformBreakdown.length > 0 &&
    platformCols.length > 0
  ) {
    const platformSheet = workbook.addWorksheet('Platforms')
    platformSheet.columns = platformCols.map((col) => ({ width: col.width }))
    platformSheet.addRow(platformCols.map((col) => col.header))
    for (const platform of artistData.platformBreakdown) {
      platformSheet.addRow(platformCols.map((col) => col.value(platform)))
    }
  }

  const countryCols = COUNTRY_COLUMNS.filter((col) =>
    enabledColumnsForSheet(excelSettings, 'countries').includes(col.id),
  )
  if (
    isExcelSheetEnabled(excelSettings, 'countries') &&
    artistData.countryBreakdown.length > 0 &&
    countryCols.length > 0
  ) {
    const countrySheet = workbook.addWorksheet('Countries')
    countrySheet.columns = countryCols.map((col) => ({ width: col.width }))
    countrySheet.addRow(countryCols.map((col) => col.header))
    for (const country of artistData.countryBreakdown) {
      countrySheet.addRow(countryCols.map((col) => col.value(country)))
    }
  }

  const monthlyCols = MONTHLY_COLUMNS.filter((col) =>
    enabledColumnsForSheet(excelSettings, 'monthly').includes(col.id),
  )
  if (
    isExcelSheetEnabled(excelSettings, 'monthly') &&
    artistData.monthlyBreakdown.length > 0 &&
    monthlyCols.length > 0
  ) {
    const monthSheet = workbook.addWorksheet('Monthly')
    monthSheet.columns = monthlyCols.map((col) => ({ width: col.width }))
    monthSheet.addRow(monthlyCols.map((col) => col.header))
    for (const month of artistData.monthlyBreakdown) {
      monthSheet.addRow(monthlyCols.map((col) => col.value(month)))
    }
  }

  if (isExcelSheetEnabled(excelSettings, 'raw')) {
    for (const sourceSheet of rawSheets) {
      await writeRawSheet(workbook, sourceSheet, onRawProgress)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
