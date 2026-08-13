import { describe, expect, it } from 'vitest'
import { normalizeAccountingConfig } from '@/lib/sos/sosAccountingSettings'
import { DEFAULT_PDF_EXPORT_SETTINGS } from '@/lib/sos/defaults'

describe('normalizeAccountingConfig', () => {
  it('fills defaults for missing fields', () => {
    const config = normalizeAccountingConfig({
      artistMappings: [{
        id: '1',
        featuringName: 'Feat',
        primaryArtist: 'Artist A',
      }],
      pdfSettings: { ...DEFAULT_PDF_EXPORT_SETTINGS, includePieChart: false },
    })

    expect(config.artistMappings).toHaveLength(1)
    expect(config.pdfSettings.includePieChart).toBe(false)
    expect(config.pdfSettings.includeReleaseBreakdown).toBe(
      DEFAULT_PDF_EXPORT_SETTINGS.includeReleaseBreakdown,
    )
    expect(config.csvImportProfiles).toEqual([])
    expect(config.excelExport.settings.sheets.releases).toBe(true)
    expect(config.excelExport.presets).toEqual([])
  })

  it('normalizes a stored excel export preset from a workspace payload', () => {
    const config = normalizeAccountingConfig({
      excelExport: {
        activePresetId: 'p1',
        settings: { columns: { 'releases.upcEan': false } },
        presets: [{ id: 'p1', name: 'No UPC', settings: { columns: { 'releases.upcEan': false } } }],
      },
    })

    expect(config.excelExport.activePresetId).toBe('p1')
    expect(config.excelExport.settings.columns['releases.upcEan']).toBe(false)
    expect(config.excelExport.settings.columns['releases.title']).toBe(true)
    expect(config.excelExport.presets).toHaveLength(1)
  })
})