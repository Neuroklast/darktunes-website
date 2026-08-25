'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMergedAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import {
  applyExcelPreset,
  DEFAULT_EXCEL_PRESET_ID,
  deleteExcelPreset,
  EXCEL_COLUMN_GROUPS,
  normalizeExcelExportSettings,
  upsertExcelPreset,
  type ExcelColumnId,
  type ExcelExportSettings,
  type ExcelExportSettingsPatch,
  type ExcelExportState,
  type ExcelSheetId,
} from '@/lib/sos/excelExportSettings'

const EXCEL_DIALOG_FALLBACK = {
  excelExportTitle: 'Excel export columns',
  excelExportDescription:
    'Choose sheets and columns for this Statement of Sales workbook. Artist, period, and final payout stay on the summary.',
  excelExportPreset: 'Preset',
  excelExportDefaultPreset: 'Default (all columns)',
  excelExportSave: 'Save preset',
  excelExportSaveAs: 'Save as…',
  excelExportDelete: 'Delete preset',
  excelExportPresetName: 'Preset name',
  excelExportPresetNamePlaceholder: 'e.g. Finance slim',
  excelExportDownload: 'Download Excel',
  excelExportCancel: 'Cancel',
  excelExportRequiredHint: 'Artist, period, and final payout are always included.',
  excelExportSelectAll: 'Select all',
  excelExportSelectNone: 'Select none',
  excelSheetSummary: 'Summary',
  excelSheetReleases: 'Releases',
  excelSheetPlatforms: 'Platforms',
  excelSheetCountries: 'Countries',
  excelSheetMonthly: 'Monthly',
  excelHideCompilations: 'Hide compilations in the release sheet',
  excelColBelieveRevenue: 'Believe revenue',
  excelColBandcampRevenue: 'Bandcamp revenue',
  excelColDarkmerchRevenue: 'Darkmerch revenue',
  excelColStreamingRevenue: 'Streaming revenue',
  excelColDownloadRevenue: 'Download revenue',
  excelColDigitalRevenue: 'Digital revenue (total)',
  excelColPhysicalRevenue: 'Physical revenue',
  excelColManualRevenue: 'Manual revenue',
  excelColGrossRevenue: 'Gross revenue',
  excelColDigitalSplits: 'Digital split rows',
  excelColPhysicalSplit: 'Physical split',
  excelColDarkmerchSplit: 'Merchandise split',
  excelColOpeningBalance: 'Opening balance',
  excelColAmountDue: 'Amount due',
  excelColReleaseTitle: 'Release title',
  excelColUpcEan: 'UPC / EAN',
  excelColCatalogNumber: 'Catalog number',
  excelColRevenue: 'Revenue',
  excelColQuantity: 'Quantity',
  excelColType: 'Type',
  excelColPlatform: 'Platform',
  excelColCountry: 'Country',
  excelColMonth: 'Month',
  excelExportPresetNameRequired: 'Enter a preset name first.',
} as const

const COLUMN_LABEL_KEYS: Record<ExcelColumnId, keyof typeof EXCEL_DIALOG_FALLBACK> = {
  'summary.believeRevenue': 'excelColBelieveRevenue',
  'summary.bandcampRevenue': 'excelColBandcampRevenue',
  'summary.darkmerchRevenue': 'excelColDarkmerchRevenue',
  'summary.streamingRevenue': 'excelColStreamingRevenue',
  'summary.downloadRevenue': 'excelColDownloadRevenue',
  'summary.digitalRevenue': 'excelColDigitalRevenue',
  'summary.physicalRevenue': 'excelColPhysicalRevenue',
  'summary.manualRevenue': 'excelColManualRevenue',
  'summary.grossRevenue': 'excelColGrossRevenue',
  'summary.digitalSplits': 'excelColDigitalSplits',
  'summary.physicalSplit': 'excelColPhysicalSplit',
  'summary.darkmerchSplit': 'excelColDarkmerchSplit',
  'summary.openingBalance': 'excelColOpeningBalance',
  'summary.amountDue': 'excelColAmountDue',
  'releases.title': 'excelColReleaseTitle',
  'releases.upcEan': 'excelColUpcEan',
  'releases.catalogNumber': 'excelColCatalogNumber',
  'releases.revenue': 'excelColRevenue',
  'releases.quantity': 'excelColQuantity',
  'releases.type': 'excelColType',
  'platforms.platform': 'excelColPlatform',
  'platforms.revenue': 'excelColRevenue',
  'platforms.quantity': 'excelColQuantity',
  'countries.country': 'excelColCountry',
  'countries.revenue': 'excelColRevenue',
  'countries.quantity': 'excelColQuantity',
  'monthly.month': 'excelColMonth',
  'monthly.revenue': 'excelColRevenue',
}

const SHEET_LABEL_KEYS: Record<ExcelSheetId, keyof typeof EXCEL_DIALOG_FALLBACK> = {
  summary: 'excelSheetSummary',
  releases: 'excelSheetReleases',
  platforms: 'excelSheetPlatforms',
  countries: 'excelSheetCountries',
  monthly: 'excelSheetMonthly',
}

export interface ExcelExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: ExcelExportState
  onStateChange: (next: ExcelExportState) => void
  onConfirm: (settings: ExcelExportSettings) => void
}

export function ExcelExportDialog({
  open,
  onOpenChange,
  state,
  onStateChange,
  onConfirm,
}: ExcelExportDialogProps) {
  const t = useMergedAccountingLabels(EXCEL_DIALOG_FALLBACK)
  const [presetName, setPresetName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const settings = state.settings

  const patchSettings = (partial: ExcelExportSettingsPatch) => {
    onStateChange({
      ...state,
      activePresetId: null,
      settings: normalizeExcelExportSettings({ ...settings, ...partial }),
    })
  }

  const toggleSheet = (sheet: ExcelSheetId, checked: boolean) => {
    patchSettings({ sheets: { ...settings.sheets, [sheet]: checked } })
  }

  const toggleColumn = (column: ExcelColumnId, checked: boolean) => {
    patchSettings({ columns: { ...settings.columns, [column]: checked } })
  }

  const setGroup = (sheet: ExcelSheetId, checked: boolean) => {
    const group = EXCEL_COLUMN_GROUPS.find((item) => item.sheet === sheet)
    if (!group) return
    const columns = { ...settings.columns }
    for (const column of group.columns) columns[column] = checked
    patchSettings({
      sheets: { ...settings.sheets, [sheet]: checked },
      columns,
    })
  }

  const selectedPresetValue = useMemo(() => {
    if (
      state.activePresetId &&
      (state.activePresetId === DEFAULT_EXCEL_PRESET_ID ||
        state.presets.some((preset) => preset.id === state.activePresetId))
    ) {
      return state.activePresetId
    }
    return 'custom'
  }, [state.activePresetId, state.presets])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.excelExportTitle}</DialogTitle>
          <DialogDescription>{t.excelExportDescription}</DialogDescription>
        </DialogHeader>

        <div
          className="max-h-[70vh] overflow-y-auto overscroll-contain space-y-5 pr-1"
          data-lenis-prevent
        >
          <div className="space-y-2">
            <Label htmlFor="excel-export-preset">{t.excelExportPreset}</Label>
            <Select
              value={selectedPresetValue}
              onValueChange={(value) => {
                if (value === 'custom') return
                onStateChange(applyExcelPreset(state, value))
                setNameError(null)
              }}
            >
              <SelectTrigger id="excel-export-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_EXCEL_PRESET_ID}>{t.excelExportDefaultPreset}</SelectItem>
                {state.presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <Label htmlFor="excel-export-preset-name">{t.excelExportPresetName}</Label>
                <Input
                  id="excel-export-preset-name"
                  value={presetName}
                  onChange={(event) => {
                    setPresetName(event.target.value)
                    setNameError(null)
                  }}
                  placeholder={t.excelExportPresetNamePlaceholder}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!presetName.trim()) {
                    setNameError(t.excelExportPresetNameRequired)
                    return
                  }
                  onStateChange(upsertExcelPreset(state, presetName, settings))
                  setPresetName('')
                }}
              >
                {t.excelExportSaveAs}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !state.activePresetId || state.activePresetId === DEFAULT_EXCEL_PRESET_ID
                }
                onClick={() => {
                  if (!state.activePresetId || state.activePresetId === DEFAULT_EXCEL_PRESET_ID) {
                    return
                  }
                  onStateChange(deleteExcelPreset(state, state.activePresetId))
                }}
              >
                {t.excelExportDelete}
              </Button>
            </div>
            {nameError && (
              <p className="text-xs text-destructive" role="alert">
                {nameError}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{t.excelExportRequiredHint}</p>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={settings.hideCompilationsInStatement}
              onCheckedChange={(checked) =>
                patchSettings({ hideCompilationsInStatement: checked === true })
              }
            />
            {t.excelHideCompilations}
          </label>

          {EXCEL_COLUMN_GROUPS.map((group) => {
            const enabledCount = group.columns.filter((column) => settings.columns[column]).length
            return (
              <section key={group.sheet} className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={settings.sheets[group.sheet]}
                      onCheckedChange={(checked) => toggleSheet(group.sheet, checked === true)}
                    />
                    {t[SHEET_LABEL_KEYS[group.sheet]]}
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setGroup(group.sheet, true)}
                    >
                      {t.excelExportSelectAll}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setGroup(group.sheet, false)}
                    >
                      {t.excelExportSelectNone}
                    </Button>
                  </div>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {group.columns.map((column) => (
                    <li key={column}>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={settings.columns[column]}
                          disabled={!settings.sheets[group.sheet]}
                          onCheckedChange={(checked) => toggleColumn(column, checked === true)}
                        />
                        {t[COLUMN_LABEL_KEYS[column]]}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {enabledCount}/{group.columns.length}
                </p>
              </section>
            )
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.excelExportCancel}
          </Button>
          <Button type="button" onClick={() => onConfirm(settings)}>
            {t.excelExportDownload}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
