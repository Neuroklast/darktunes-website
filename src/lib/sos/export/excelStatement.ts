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
export async function generateExcel(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  compilationFilters: CompilationFilter[] = [],
  settings?: ExcelGenerateSettings,
): Promise<Blob> {
  try {
    return await buildExcel(artistData, labelInfo, periodStart, periodEnd, compilationFilters, settings)
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

async function buildExcel(
  artistData: SafeProcessedArtistData,
  labelInfo: LabelInfo,
  periodStart?: string,
  periodEnd?: string,
  compilationFilters: CompilationFilter[] = [],
  settings?: ExcelGenerateSettings,
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
    summaryData.push(['Final Payout', artistData.finalPayout])

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

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
