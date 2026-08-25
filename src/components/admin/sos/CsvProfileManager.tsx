'use client'

/**
 * src/components/admin/sos/CsvProfileManager.tsx
 *
 * Save / load named SOS rule presets via Supabase (sos_rules_presets).
 * One-time migration from legacy localStorage presets on first mount.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FloppyDisk, FolderOpen, Trash, BookmarkSimple, Warning, CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type {
  ArtistMapping, CompilationFilter, SplitFee,
  ManualRevenue, ExpenseEntry, IgnoredEntry,
  CSVColumnAlias, AppDefaults, EmailConfig,
  TrackRevenueAssignment, LabelInfo, PdfExportSettings,
} from '@/lib/sos/types'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'
import { DEFAULT_PDF_EXPORT_SETTINGS, DEFAULT_LABEL_INFO } from '@/lib/sos/defaults'
import { DEFAULT_EXCEL_EXPORT_STATE, type ExcelExportState } from '@/lib/sos/excelExportSettings'
import { DEFAULT_PRESET_NAME } from '@/lib/sos/sosAccountingSettings'
import { useSosRulesPresets, type PresetConfig } from '@/hooks/useSosRulesPresets'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'

const LEGACY_STORAGE_KEY = 'darktunes_sos_presets'

interface LegacySosPreset {
  id: string
  name: string
  savedAt: string
  artistMappings: ArtistMapping[]
  compilationFilters: CompilationFilter[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  expenses: ExpenseEntry[]
  ignoredEntries: IgnoredEntry[]
  csvAliases: CSVColumnAlias[]
  appDefaults: AppDefaults
  emailConfig: Partial<EmailConfig>
}

interface CsvProfileManagerProps {
  artistMappings: ArtistMapping[]
  compilationFilters: CompilationFilter[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  expenses: ExpenseEntry[]
  ignoredEntries: IgnoredEntry[]
  csvAliases: CSVColumnAlias[]
  trackRevenueAssignments: TrackRevenueAssignment[]
  appDefaults: AppDefaults
  emailConfig: Partial<EmailConfig>
  labelInfo: Partial<LabelInfo>
  pdfSettings: PdfExportSettings
  csvImportProfiles: CsvImportProfile[]
  excelExport: ExcelExportState
  onLoad: (preset: PresetConfig) => void
}

function loadLegacyPresets(): LegacySosPreset[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LegacySosPreset[]) : []
  } catch {
    return []
  }
}

function legacyToConfig(preset: LegacySosPreset): PresetConfig {
  return {
    artistMappings: preset.artistMappings ?? [],
    compilationFilters: preset.compilationFilters ?? [],
    splitFees: preset.splitFees ?? [],
    manualRevenues: preset.manualRevenues ?? [],
    expenses: preset.expenses ?? [],
    ignoredEntries: preset.ignoredEntries ?? [],
    csvAliases: preset.csvAliases ?? [],
    appDefaults: preset.appDefaults,
    emailConfig: preset.emailConfig ?? {},
    trackRevenueAssignments: [],
    labelInfo: DEFAULT_LABEL_INFO,
    pdfSettings: DEFAULT_PDF_EXPORT_SETTINGS,
    csvImportProfiles: [],
    excelExport: DEFAULT_EXCEL_EXPORT_STATE,
  }
}

function countRules(config: PresetConfig): number {
  return (
    config.artistMappings.length +
    config.compilationFilters.length +
    config.splitFees.length +
    config.manualRevenues.length +
    config.expenses.length +
    config.ignoredEntries.length +
    config.csvAliases.length +
    config.trackRevenueAssignments.length
  )
}

export function CsvProfileManager({
  artistMappings, compilationFilters, splitFees, manualRevenues, expenses,
  ignoredEntries, csvAliases, trackRevenueAssignments, appDefaults, emailConfig,
  labelInfo, pdfSettings, csvImportProfiles, excelExport, onLoad,
}: CsvProfileManagerProps) {
  const t = useAccountingLabels()
  const { presets, isLoading, isSaving, savePreset, deletePreset, reloadPresets } =
    useSosRulesPresets()

  const [name, setName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const migrationStarted = useRef(false)

  useEffect(() => {
    if (migrationStarted.current || isLoading) return
    migrationStarted.current = true

    const legacy = loadLegacyPresets()
    if (legacy.length === 0) return

    const existingNames = new Set(presets.map((p) => p.name.toLowerCase()))
    const toMigrate = legacy.filter((p) => !existingNames.has(p.name.toLowerCase()))
    if (toMigrate.length === 0) {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return
    }

    void (async () => {
      let migrated = 0
      for (const preset of toMigrate) {
        try {
          const res = await fetch('/api/admin/sos/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: preset.name, config: legacyToConfig(preset) }),
          })
          if (res.ok) migrated += 1
        } catch {
          // Non-fatal — user can re-save manually
        }
      }
      if (migrated > 0) {
        toast.success(
          interpolate(t.presetMigratedToast ?? 'Migrated {count} preset(s) from local storage', {
            count: migrated,
          }),
        )
        localStorage.removeItem(LEGACY_STORAGE_KEY)
        await reloadPresets()
      }
    })()
  }, [isLoading, presets, reloadPresets, t.presetMigratedToast])

  const currentConfig = useCallback(
    (): PresetConfig => ({
      artistMappings,
      compilationFilters,
      splitFees,
      manualRevenues,
      expenses,
      ignoredEntries,
      csvAliases,
      appDefaults,
      emailConfig,
      trackRevenueAssignments,
      labelInfo,
      pdfSettings,
      csvImportProfiles,
      excelExport,
    }),
    [
      artistMappings, compilationFilters, splitFees, manualRevenues, expenses,
      ignoredEntries, csvAliases, appDefaults, emailConfig, trackRevenueAssignments,
      labelInfo, pdfSettings, csvImportProfiles, excelExport,
    ],
  )

  const handleSave = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await savePreset(trimmed, currentConfig())
    setName('')
  }, [name, savePreset, currentConfig])

  const handleLoad = useCallback(
    (config: PresetConfig, id: string) => {
      onLoad(config)
      setLoadedId(id)
      setTimeout(() => setLoadedId(null), 2000)
    },
    [onLoad],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const target = presets.find((p) => p.id === id)
      if (target?.name.toLowerCase() === DEFAULT_PRESET_NAME.toLowerCase()) {
        toast.error(t.presetDeleteDefaultBlocked ?? 'The Default preset cannot be deleted')
        setConfirmDeleteId(null)
        return
      }
      await deletePreset(id)
      setConfirmDeleteId(null)
    },
    [deletePreset, presets, t.presetDeleteDefaultBlocked],
  )

  const totalRules = countRules(currentConfig())
  const deleteTarget = presets.find((p) => p.id === confirmDeleteId)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BookmarkSimple size={20} weight="bold" className="text-primary" />
        <h3 className="font-semibold">{t.presetsTitle ?? 'Rule Presets'}</h3>
        {totalRules > 0 && (
          <Badge variant="secondary" className="text-xs">
            {interpolate(t.presetRulesLoaded ?? '{count} rules loaded', { count: totalRules })}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">{t.presetSaveHeading ?? 'Save Current Rules'}</h4>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.presetNamePlaceholder ?? 'Preset name, e.g. Q1-2025'}
            onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
            className="flex-1"
          />
          <Button
            onClick={() => void handleSave()}
            disabled={!name.trim() || isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : (
              <FloppyDisk size={15} weight="bold" />
            )}
            {t.presetSaveButton ?? 'Save'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <CircleNotch size={20} className="animate-spin" />
          <span className="text-sm">{t.bronzeLoading ?? 'Loading…'}</span>
        </div>
      ) : presets.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <BookmarkSimple size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t.presetEmpty ?? 'No presets saved yet.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            {interpolate(t.presetSavedList ?? 'Saved Presets ({count})', { count: presets.length })}
          </h4>
          {presets.map((p) => {
            const ruleCount = countRules(p.config)
            return (
              <Card key={p.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {interpolate(t.presetRulesCount ?? '{count} rules · saved {date}', {
                      count: ruleCount,
                      date: new Date(p.updated_at).toLocaleDateString(),
                    })}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoad(p.config, p.id)}
                    className="h-7 gap-1 text-xs"
                  >
                    {loadedId === p.id ? (
                      <>
                        <span className="text-green-600">✓</span> {t.presetLoaded ?? 'Loaded'}
                      </>
                    ) : (
                      <>
                        <FolderOpen size={13} /> {t.presetLoadButton ?? 'Load'}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`${t.presetDeleteButton ?? 'Delete'} ${p.name}`}
                  >
                    <Trash size={13} />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={confirmDeleteId !== null} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warning size={18} className="text-destructive" />
              {t.presetDeleteTitle ?? 'Delete Preset'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {interpolate(
              t.presetDeleteConfirm ??
                'Are you sure you want to delete "{name}"? This cannot be undone.',
              { name: deleteTarget?.name ?? '' },
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {t.presetDeleteCancel ?? 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
            >
              {t.presetDeleteButton ?? 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}