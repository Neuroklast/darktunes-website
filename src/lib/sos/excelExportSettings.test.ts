import { describe, expect, it } from 'vitest'
import {
  applyExcelPreset,
  DEFAULT_EXCEL_EXPORT_SETTINGS,
  DEFAULT_EXCEL_PRESET_ID,
  deleteExcelPreset,
  enabledColumnsForSheet,
  isExcelSheetEnabled,
  normalizeExcelExportSettings,
  normalizeExcelExportState,
  upsertExcelPreset,
} from './excelExportSettings'

describe('normalizeExcelExportSettings', () => {
  it('fills missing sheets and columns from defaults', () => {
    const settings = normalizeExcelExportSettings({
      sheets: { countries: false },
      columns: { 'releases.upcEan': false },
    })

    expect(settings.sheets.releases).toBe(true)
    expect(settings.sheets.countries).toBe(false)
    expect(settings.columns['releases.title']).toBe(true)
    expect(settings.columns['releases.upcEan']).toBe(false)
    expect(settings.hideCompilationsInStatement).toBe(true)
  })

  it('treats empty input as the current Excel default', () => {
    expect(normalizeExcelExportSettings(undefined)).toEqual(DEFAULT_EXCEL_EXPORT_SETTINGS)
  })
})

describe('normalizeExcelExportState', () => {
  it('drops invalid presets and resets a missing active id', () => {
    const state = normalizeExcelExportState({
      activePresetId: 'gone',
      presets: [{ id: 'ok', name: 'Finance', settings: { sheets: { monthly: false } } }],
    })

    expect(state.activePresetId).toBe(DEFAULT_EXCEL_PRESET_ID)
    expect(state.presets).toHaveLength(1)
    expect(state.presets[0]?.settings.sheets.monthly).toBe(false)
    expect(state.presets[0]?.settings.sheets.releases).toBe(true)
  })
})

describe('sheet and column filters', () => {
  it('disables a sheet when the sheet flag is off', () => {
    const settings = normalizeExcelExportSettings({
      sheets: { releases: false },
    })
    expect(isExcelSheetEnabled(settings, 'releases')).toBe(false)
    expect(enabledColumnsForSheet(settings, 'releases')).toEqual([])
  })

  it('returns only enabled columns for a live sheet', () => {
    const settings = normalizeExcelExportSettings({
      columns: { 'releases.upcEan': false, 'releases.catalogNumber': false },
    })
    expect(enabledColumnsForSheet(settings, 'releases')).toEqual([
      'releases.title',
      'releases.revenue',
      'releases.quantity',
      'releases.type',
    ])
  })
})

describe('excel presets', () => {
  it('saves a named preset and makes it active', () => {
    const next = upsertExcelPreset(
      normalizeExcelExportState(),
      'No UPC',
      normalizeExcelExportSettings({ columns: { 'releases.upcEan': false } }),
    )

    expect(next.presets).toHaveLength(1)
    expect(next.presets[0]?.name).toBe('No UPC')
    expect(next.activePresetId).toBe(next.presets[0]?.id)
    expect(next.settings.columns['releases.upcEan']).toBe(false)
  })

  it('overwrites a preset with the same name', () => {
    const first = upsertExcelPreset(
      normalizeExcelExportState(),
      'Slim',
      normalizeExcelExportSettings({ sheets: { monthly: false } }),
    )
    const second = upsertExcelPreset(
      first,
      'slim',
      normalizeExcelExportSettings({ sheets: { countries: false } }),
    )

    expect(second.presets).toHaveLength(1)
    expect(second.presets[0]?.settings.sheets.countries).toBe(false)
  })

  it('does not delete the built-in default id and restores defaults after deleting the active preset', () => {
    const saved = upsertExcelPreset(
      normalizeExcelExportState(),
      'Temp',
      normalizeExcelExportSettings({ sheets: { monthly: false } }),
    )
    expect(deleteExcelPreset(saved, DEFAULT_EXCEL_PRESET_ID).presets).toHaveLength(1)

    const afterDelete = deleteExcelPreset(saved, saved.presets[0]!.id)
    expect(afterDelete.presets).toHaveLength(0)
    expect(afterDelete.activePresetId).toBe(DEFAULT_EXCEL_PRESET_ID)
    expect(afterDelete.settings).toEqual(DEFAULT_EXCEL_EXPORT_SETTINGS)
  })

  it('applies a stored preset', () => {
    const saved = upsertExcelPreset(
      normalizeExcelExportState(),
      'Slim',
      normalizeExcelExportSettings({ sheets: { monthly: false } }),
    )
    const reset = applyExcelPreset(saved, DEFAULT_EXCEL_PRESET_ID)
    expect(reset.settings.sheets.monthly).toBe(true)

    const applied = applyExcelPreset(reset, saved.presets[0]!.id)
    expect(applied.settings.sheets.monthly).toBe(false)
    expect(applied.activePresetId).toBe(saved.presets[0]?.id)
  })
})
