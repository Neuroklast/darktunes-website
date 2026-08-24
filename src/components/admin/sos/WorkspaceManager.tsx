'use client'

import { useTranslations } from 'next-intl'
/**
 * Export / import the full SOS accounting settings bundle as JSON backup.
 */

import { useRef, useCallback } from 'react'
import { DownloadSimple, UploadSimple, Warning } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { SosAccountingSettings } from '@/lib/sos/sosAccountingSettings'

const WORKSPACE_VERSION = 2

export interface WorkspaceBundle extends SosAccountingSettings {
  version: number
  exportedAt: string
}

interface WorkspaceManagerProps extends SosAccountingSettings {
  onImport: (bundle: Partial<SosAccountingSettings>) => void
}

export function WorkspaceManager({
  appDefaults,
  emailConfig,
  artistMappings,
  compilationFilters,
  splitFees,
  manualRevenues,
  expenses,
  ignoredEntries,
  csvAliases,
  trackRevenueAssignments,
  labelInfo,
  pdfSettings,
  csvImportProfiles,
  excelExport,
  onImport,
}: WorkspaceManagerProps) {
  const tToast = useTranslations('admin.toast')


  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = useCallback(() => {
    const bundle: WorkspaceBundle = {
      version: WORKSPACE_VERSION,
      exportedAt: new Date().toISOString(),
      appDefaults,
      emailConfig,
      artistMappings,
      compilationFilters,
      splitFees,
      manualRevenues,
      expenses,
      ignoredEntries,
      csvAliases,
      trackRevenueAssignments,
      labelInfo,
      pdfSettings,
      csvImportProfiles,
      excelExport,
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `darktunes-sos-workspace-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(tToast('workspace_exported'))
  }, [appDefaults, emailConfig, artistMappings, compilationFilters, splitFees,
    manualRevenues, expenses, ignoredEntries, csvAliases, trackRevenueAssignments,
    labelInfo, pdfSettings, csvImportProfiles, excelExport, tToast])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = ev.target?.result as string
        const bundle = JSON.parse(raw) as Partial<WorkspaceBundle> & {
          pdfExportSettings?: WorkspaceBundle['pdfSettings']
        }
        if (!bundle || typeof bundle !== 'object') throw new Error('Invalid workspace file')
        onImport({
          appDefaults: bundle.appDefaults,
          emailConfig: bundle.emailConfig ?? {},
          artistMappings: bundle.artistMappings ?? [],
          compilationFilters: bundle.compilationFilters ?? [],
          splitFees: bundle.splitFees ?? [],
          manualRevenues: bundle.manualRevenues ?? [],
          expenses: bundle.expenses ?? [],
          ignoredEntries: bundle.ignoredEntries ?? [],
          csvAliases: bundle.csvAliases ?? [],
          trackRevenueAssignments: bundle.trackRevenueAssignments ?? [],
          labelInfo: bundle.labelInfo,
          pdfSettings: bundle.pdfSettings ?? bundle.pdfExportSettings,
          csvImportProfiles: bundle.csvImportProfiles,
          excelExport: bundle.excelExport,
        })
        toast.success(tToast('workspace_imported'))
      } catch {
        toast.error(tToast('failed_parse_workspace'))
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsText(file)
  }, [onImport, tToast])

  const totalRules =
    artistMappings.length + compilationFilters.length + splitFees.length +
    manualRevenues.length + expenses.length + ignoredEntries.length +
    csvAliases.length + trackRevenueAssignments.length + csvImportProfiles.length

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <DownloadSimple size={20} weight="bold" className="text-primary" />
        <h3 className="font-semibold">Workspace Import / Export</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Export the entire SOS configuration (rules, label branding, PDF settings, CSV profiles) to a
        JSON file for backup or transfer. Import restores all settings at once.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <DownloadSimple size={16} className="text-primary" />
            <h4 className="text-sm font-semibold">Export Workspace</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            Downloads a JSON snapshot of all {totalRules} rules and settings.
          </p>
          <Button onClick={handleExport} className="gap-1.5 w-full">
            <DownloadSimple size={15} weight="bold" /> Export to JSON
          </Button>
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <UploadSimple size={16} className="text-primary" />
            <h4 className="text-sm font-semibold">Import Workspace</h4>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <Warning size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
            Importing replaces current rules and settings with those from the file.
          </p>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5 w-full"
          >
            <UploadSimple size={15} weight="bold" /> Import from JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
        </Card>
      </div>
    </div>
  )
}