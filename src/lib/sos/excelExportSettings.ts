export const EXCEL_SHEET_IDS = [
  'summary',
  'releases',
  'platforms',
  'countries',
  'monthly',
] as const

export type ExcelSheetId = (typeof EXCEL_SHEET_IDS)[number]

export const EXCEL_COLUMN_IDS = [
  'summary.believeRevenue',
  'summary.bandcampRevenue',
  'summary.darkmerchRevenue',
  'summary.streamingRevenue',
  'summary.downloadRevenue',
  'summary.digitalRevenue',
  'summary.physicalRevenue',
  'summary.manualRevenue',
  'summary.grossRevenue',
  'summary.digitalSplits',
  'summary.physicalSplit',
  'summary.darkmerchSplit',
  'summary.openingBalance',
  'summary.amountDue',
  'releases.title',
  'releases.upcEan',
  'releases.catalogNumber',
  'releases.revenue',
  'releases.quantity',
  'releases.type',
  'platforms.platform',
  'platforms.revenue',
  'platforms.quantity',
  'countries.country',
  'countries.revenue',
  'countries.quantity',
  'monthly.month',
  'monthly.revenue',
] as const

export type ExcelColumnId = (typeof EXCEL_COLUMN_IDS)[number]

export interface ExcelExportSettings {
  sheets: Record<ExcelSheetId, boolean>
  columns: Record<ExcelColumnId, boolean>
  hideCompilationsInStatement: boolean
}

export interface ExcelExportPreset {
  id: string
  name: string
  settings: ExcelExportSettings
}

export interface ExcelExportState {
  activePresetId: string | null
  settings: ExcelExportSettings
  presets: ExcelExportPreset[]
}

export const DEFAULT_EXCEL_PRESET_ID = 'default'

export const DEFAULT_EXCEL_EXPORT_SETTINGS: ExcelExportSettings = {
  sheets: {
    summary: true,
    releases: true,
    platforms: true,
    countries: true,
    monthly: true,
  },
  columns: Object.fromEntries(EXCEL_COLUMN_IDS.map((id) => [id, true])) as Record<
    ExcelColumnId,
    boolean
  >,
  hideCompilationsInStatement: true,
}

export const DEFAULT_EXCEL_EXPORT_STATE: ExcelExportState = {
  activePresetId: DEFAULT_EXCEL_PRESET_ID,
  settings: DEFAULT_EXCEL_EXPORT_SETTINGS,
  presets: [],
}

export const EXCEL_COLUMN_GROUPS: Array<{
  sheet: ExcelSheetId
  columns: ExcelColumnId[]
}> = [
  {
    sheet: 'summary',
    columns: [
      'summary.believeRevenue',
      'summary.bandcampRevenue',
      'summary.darkmerchRevenue',
      'summary.streamingRevenue',
      'summary.downloadRevenue',
      'summary.digitalRevenue',
      'summary.physicalRevenue',
      'summary.manualRevenue',
      'summary.grossRevenue',
      'summary.digitalSplits',
      'summary.physicalSplit',
      'summary.darkmerchSplit',
      'summary.openingBalance',
      'summary.amountDue',
    ],
  },
  {
    sheet: 'releases',
    columns: [
      'releases.title',
      'releases.upcEan',
      'releases.catalogNumber',
      'releases.revenue',
      'releases.quantity',
      'releases.type',
    ],
  },
  {
    sheet: 'platforms',
    columns: ['platforms.platform', 'platforms.revenue', 'platforms.quantity'],
  },
  {
    sheet: 'countries',
    columns: ['countries.country', 'countries.revenue', 'countries.quantity'],
  },
  {
    sheet: 'monthly',
    columns: ['monthly.month', 'monthly.revenue'],
  },
]

export type ExcelExportSettingsPatch = {
  sheets?: Partial<Record<ExcelSheetId, boolean>>
  columns?: Partial<Record<ExcelColumnId, boolean>>
  hideCompilationsInStatement?: boolean
}

export function normalizeExcelExportSettings(
  raw?: ExcelExportSettingsPatch | null,
): ExcelExportSettings {
  return {
    sheets: {
      ...DEFAULT_EXCEL_EXPORT_SETTINGS.sheets,
      ...(raw?.sheets ?? {}),
    },
    columns: {
      ...DEFAULT_EXCEL_EXPORT_SETTINGS.columns,
      ...(raw?.columns ?? {}),
    },
    hideCompilationsInStatement:
      raw?.hideCompilationsInStatement ??
      DEFAULT_EXCEL_EXPORT_SETTINGS.hideCompilationsInStatement,
  }
}

export type ExcelExportStatePatch = {
  activePresetId?: string | null
  settings?: ExcelExportSettingsPatch
  presets?: Array<{
    id?: string
    name?: string
    settings?: ExcelExportSettingsPatch
  }>
}

export function normalizeExcelExportState(
  raw?: ExcelExportStatePatch | null,
): ExcelExportState {
  const presets = (raw?.presets ?? [])
    .filter((preset): preset is { id: string; name: string; settings?: ExcelExportSettingsPatch } => {
      return (
        !!preset &&
        typeof preset === 'object' &&
        typeof preset.id === 'string' &&
        typeof preset.name === 'string'
      )
    })
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      settings: normalizeExcelExportSettings(preset.settings),
    }))

  const activePresetId =
    raw?.activePresetId === DEFAULT_EXCEL_PRESET_ID ||
    presets.some((preset) => preset.id === raw?.activePresetId)
      ? (raw?.activePresetId ?? DEFAULT_EXCEL_PRESET_ID)
      : DEFAULT_EXCEL_PRESET_ID

  return {
    activePresetId,
    settings: normalizeExcelExportSettings(raw?.settings),
    presets,
  }
}

export function isExcelSheetEnabled(
  settings: ExcelExportSettings,
  sheet: ExcelSheetId,
): boolean {
  if (!settings.sheets[sheet]) return false
  const group = EXCEL_COLUMN_GROUPS.find((item) => item.sheet === sheet)
  if (!group) return false
  return group.columns.some((column) => settings.columns[column])
}

export function enabledColumnsForSheet(
  settings: ExcelExportSettings,
  sheet: ExcelSheetId,
): ExcelColumnId[] {
  const group = EXCEL_COLUMN_GROUPS.find((item) => item.sheet === sheet)
  if (!group || !settings.sheets[sheet]) return []
  return group.columns.filter((column) => settings.columns[column])
}

export function upsertExcelPreset(
  state: ExcelExportState,
  name: string,
  settings: ExcelExportSettings,
  id?: string,
): ExcelExportState {
  const trimmed = name.trim()
  if (!trimmed) return state

  const existing =
    (id ? state.presets.find((preset) => preset.id === id) : undefined) ??
    state.presets.find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase())

  const presetId = existing?.id ?? id ?? crypto.randomUUID()
  const nextPreset: ExcelExportPreset = {
    id: presetId,
    name: trimmed,
    settings: normalizeExcelExportSettings(settings),
  }

  const presets = existing
    ? state.presets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
    : [nextPreset, ...state.presets]

  return {
    activePresetId: presetId,
    settings: nextPreset.settings,
    presets,
  }
}

export function deleteExcelPreset(state: ExcelExportState, id: string): ExcelExportState {
  if (id === DEFAULT_EXCEL_PRESET_ID) return state
  const presets = state.presets.filter((preset) => preset.id !== id)
  const activePresetId =
    state.activePresetId === id ? DEFAULT_EXCEL_PRESET_ID : state.activePresetId
  return {
    ...state,
    presets,
    activePresetId,
    settings:
      activePresetId === DEFAULT_EXCEL_PRESET_ID
        ? DEFAULT_EXCEL_EXPORT_SETTINGS
        : state.settings,
  }
}

export function applyExcelPreset(state: ExcelExportState, id: string): ExcelExportState {
  if (id === DEFAULT_EXCEL_PRESET_ID) {
    return {
      ...state,
      activePresetId: DEFAULT_EXCEL_PRESET_ID,
      settings: DEFAULT_EXCEL_EXPORT_SETTINGS,
    }
  }
  const preset = state.presets.find((item) => item.id === id)
  if (!preset) return state
  return {
    ...state,
    activePresetId: preset.id,
    settings: normalizeExcelExportSettings(preset.settings),
  }
}
