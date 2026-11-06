'use client'

/**
 * src/components/admin/AccountingPanel.tsx
 *
 * Two-tab accounting panel:
 *  Tab A — "Generate Statements": full SOS Generator workflow embedded in admin.
 *           Artists come from useArtists() (no CSV roster upload needed).
 *  Tab B — "Statement History": read-only view of uploaded PDFs (StatementsManager).
 */

import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  resolveAccountingPeriod,
} from '@/lib/sos/accountingPeriod'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useArtists } from '@/hooks/useArtists'
import { useSiteSettings } from '@/hooks/useSiteSettings'
import { useCSVProcessor } from '@/hooks/useSosCSVProcessor'
import { useExports } from '@/hooks/useSosExports'
import { useFileManager } from '@/hooks/useSosFileManager'
import { mapArtistsToLabelArtists } from '@/lib/sos/artistBridge'
import { normalizeArtistNameKey } from '@/lib/sos/artistNameKey'
import { listBillingProfiles, type ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type {
  LabelInfo, PdfExportSettings, AppDefaults,
  ArtistMapping, CompilationFilter, SplitFee,
  ManualRevenue, ExpenseEntry, IgnoredEntry,
  CSVColumnAlias, EmailConfig, TrackRevenueAssignment,
} from '@/lib/sos/types'
import { DEFAULT_PDF_EXPORT_SETTINGS, DEFAULT_APP_DEFAULTS, DEFAULT_EMAIL_CONFIG, DEFAULT_LABEL_INFO } from '@/lib/sos/defaults'
import {
  durableAccountingSettings,
  mergePeriodScopedSettings,
  normalizeAccountingConfig,
  settingsFingerprint,
  type SosAccountingSettings,
} from '@/lib/sos/sosAccountingSettings'
import {
  DEFAULT_EXCEL_EXPORT_STATE,
  type ExcelExportSettings,
  type ExcelExportState,
} from '@/lib/sos/excelExportSettings'
import { ExcelExportDialog } from '@/components/admin/sos/ExcelExportDialog'
import { ExcelExportFallbackDialog } from '@/components/admin/sos/ExcelExportFallbackDialog'
import { AccountingGuidedWizard } from '@/components/admin/sos/AccountingGuidedWizard'
import { SosValidationPanel } from '@/components/admin/sos/SosValidationPanel'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'
import { MonthField } from '@/components/ui/month-field'
import { isValidPeriodRange } from '@/lib/sos/accountingInputValidation'
import { UniversalFileUploadZone } from '@/components/admin/sos/UniversalFileUploadZone'
import { ReportingPanel } from '@/components/admin/sos/ReportingPanel'
import { CurrencyRatesBanner } from '@/components/admin/sos/CurrencyRatesBanner'
import { SettlementCenterPanel } from '@/components/admin/sos/SettlementCenterPanel'
import { OperatorPlaybook } from '@/components/admin/sos/OperatorPlaybook'
import { PayoutManager } from '@/components/admin/sos/PayoutManager'
import { PdfExportSettingsPanel } from '@/components/admin/sos/PdfExportSettingsPanel'
import { RulesPanel, type RulesTab } from '@/components/admin/sos/RulesPanel'
import { SosAnalyticsPersistPanel } from '@/components/admin/sos/SosAnalyticsPersistPanel'
import { ImportBatchesPanel } from '@/components/admin/sos/ImportBatchesPanel'
import { SosConfirmDialog } from '@/components/admin/sos/SosConfirmDialog'
import { ExternalMetricsSyncPanel } from '@/components/admin/sos/ExternalMetricsSyncPanel'
import { ApifySpotifySyncPanel } from '@/components/admin/sos/ApifySpotifySyncPanel'
import dynamic from 'next/dynamic'
const TrendsDashboard = dynamic(() => import('@/components/admin/sos/TrendsDashboard').then(mod => mod.TrendsDashboard), { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> })
import { CsvProfileManager } from '@/components/admin/sos/CsvProfileManager'
import { CsvImportProfileEditor } from '@/components/admin/sos/CsvImportProfileEditor'
import { AdminEnterpriseAnalytics } from '@/components/admin/sos/AdminEnterpriseAnalytics'
import { useCsvImportProfiles } from '@/hooks/useCsvImportProfiles'
import { useSosWorkspaceSync } from '@/hooks/useSosWorkspaceSync'
import { WorkspaceManager } from '@/components/admin/sos/WorkspaceManager'

import {
  Wallet, ClockCounterClockwise, FileText,
  ChartBar, BookmarkSimple, DownloadSimple, Table, SealCheck,
  MagnifyingGlass, SlidersHorizontal, ArrowLeft, GearSix, CaretDown,
} from '@phosphor-icons/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { useAccountingLabels } from '@/lib/i18n/accountingFallbacks'
import { interpolate } from '@/lib/i18n/interpolate'
import { validateSosWizardState } from '@/lib/sos/wizardValidation'
import type { GuidedWizardStep } from '@/lib/sos/guidedWizard'
import { type SosParseDoneStats, type SosParseProgress } from '@/lib/sos/ingestProgress'
import type { FileProcessingState } from '@/lib/sos/types'

const StatementsManager = lazy(
  () => import('@/components/admin/StatementsManager').then(m => ({ default: m.StatementsManager }))
)

type SubTab = 'upload' | 'validate' | 'reporting' | 'settlements' | 'analytics' | 'rules'

const SUB_TAB_IDS: SubTab[] = ['upload', 'validate', 'reporting', 'settlements', 'analytics', 'rules']

const SUB_TAB_BY_WIZARD_STEP: Record<GuidedWizardStep, SubTab> = {
  upload: 'upload',
  validate: 'validate',
  review: 'reporting',
  settle: 'settlements',
}

function isSubTab(value: string | null): value is SubTab {
  return value != null && (SUB_TAB_IDS as string[]).includes(value)
}

function SosGeneratorPanel() {
  const searchParams = useSearchParams()
  const t = useAccountingLabels()
  const { artists } = useArtists()
  const { settings } = useSiteSettings()
  // Portal artist roster + billing profiles (never CSV master data)
  const [billingByArtistId, setBillingByArtistId] = useState<Map<string, ArtistBillingProfile>>(
    () => new Map(),
  )
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const profiles = await listBillingProfiles(supabase)
        if (cancelled) return
        setBillingByArtistId(new Map(profiles.map((p) => [p.artistId, p])))
      } catch {
        if (!cancelled) setBillingByArtistId(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [artists])
  const labelArtists = useMemo(
    () => mapArtistsToLabelArtists(artists, billingByArtistId),
    [artists, billingByArtistId],
  )

  const [labelBranding, setLabelBranding] = useState<Partial<LabelInfo>>(DEFAULT_LABEL_INFO)
  const [pdfSettings, setPdfSettings] = useState<PdfExportSettings>(DEFAULT_PDF_EXPORT_SETTINGS)
  const [excelExport, setExcelExport] = useState<ExcelExportState>(DEFAULT_EXCEL_EXPORT_STATE)
  const [excelDialogOpen, setExcelDialogOpen] = useState(false)
  const [excelDialogTarget, setExcelDialogTarget] = useState<
    { kind: 'one'; artist: string } | { kind: 'all' } | { kind: 'selected'; artists: string[] } | null
  >(null)
  const [csvImportProfilesCustom, setCsvImportProfilesCustom] = useState<CsvImportProfile[]>([])
  const {
    profiles: csvImportProfiles,
    customProfiles,
    shadowedProfiles,
    nameConflicts,
    saveProfile: saveCsvProfile,
    deleteProfile: deleteCsvProfile,
  } = useCsvImportProfiles(csvImportProfilesCustom, setCsvImportProfilesCustom)

  // Workspace branding wins when set; site impressum is fallback for empty fields only.
  // Address is always structured in the UI (LabelAddressFields) and stored multi-line on LabelInfo.address.
  const labelInfo = useMemo<LabelInfo>(() => ({
    ...DEFAULT_LABEL_INFO,
    ...labelBranding,
    name: labelBranding?.name?.trim() || settings.labelName || DEFAULT_LABEL_INFO.name,
    address: labelBranding?.address?.trim() || settings.impressumAddress || DEFAULT_LABEL_INFO.address,
    taxId: labelBranding?.taxId?.trim() || settings.impressumVatId || DEFAULT_LABEL_INFO.taxId,
  }), [labelBranding, settings])

  const handleLabelInfoUpdate = useCallback((next: LabelInfo) => {
    setLabelBranding({
      ...DEFAULT_LABEL_INFO,
      ...next,
      sepaIban: next.sepaIban
        ? next.sepaIban.replace(/[\s-]/g, '').toUpperCase()
        : next.sepaIban,
      sepaAccountHolder: next.sepaAccountHolder?.trim() || undefined,
    })
  }, [])

  const handleLabelSepaUpdate = useCallback(
    (sepaIban: string, sepaAccountHolder: string) => {
      setLabelBranding((current) => ({
        ...DEFAULT_LABEL_INFO,
        ...current,
        sepaIban: sepaIban.replace(/[\s-]/g, '').toUpperCase(),
        sepaAccountHolder: sepaAccountHolder.trim(),
      }))
    },
    [],
  )

  const [appDefaults, setAppDefaults] = useState<AppDefaults>(DEFAULT_APP_DEFAULTS)
  const [emailConfig, setEmailConfig] = useState<Partial<EmailConfig>>(DEFAULT_EMAIL_CONFIG)
  const [settingsPanel, setSettingsPanel] = useState<'presets' | 'csv' | 'workspace' | 'pdf' | null>(null)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('upload')
  const previousWorkflowStep = useRef<SubTab>('upload')
  const [activeRuleTab, setActiveRuleTab] = useState<RulesTab>('label')
  const [manualPeriodStart, setManualPeriodStart] = useState('')
  const [manualPeriodEnd, setManualPeriodEnd] = useState('')
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false)
  const [workspaceDeleting, setWorkspaceDeleting] = useState(false)
  const [restoringArchives, setRestoringArchives] = useState(false)
  const [showArchiveRegistry, setShowArchiveRegistry] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<{ completed: number; total: number } | null>(null)

  useEffect(() => {
    const subTab = searchParams.get('subTab')
    const guidedStepParam = searchParams.get('guidedStep')
    if (subTab === 'payout' || subTab === 'settlements' || guidedStepParam === 'settle') {
      setActiveSubTab('settlements')
      return
    }
    if (subTab === 'trends') {
      setActiveSubTab('analytics')
      return
    }
    if (isSubTab(subTab)) {
      setActiveSubTab(subTab)
    }
  }, [searchParams])

  // Rules state
  const [artistMappings, setArtistMappings] = useState<ArtistMapping[]>([])
  const [compilationFilters, setCompilationFilters] = useState<CompilationFilter[]>([])
  const [splitFees, setSplitFees] = useState<SplitFee[]>([])
  const [manualRevenues, setManualRevenues] = useState<ManualRevenue[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [ignoredEntries, setIgnoredEntries] = useState<IgnoredEntry[]>([])
  const [csvAliases, setCsvAliases] = useState<CSVColumnAlias[]>([])
  const [trackRevenueAssignments, setTrackRevenueAssignments] = useState<TrackRevenueAssignment[]>([])

  const settingsBundle = useMemo<SosAccountingSettings>(
    () => ({
      artistMappings,
      compilationFilters,
      splitFees,
      manualRevenues,
      expenses,
      ignoredEntries,
      csvAliases,
      trackRevenueAssignments,
      appDefaults,
      emailConfig,
      labelInfo: labelBranding,
      pdfSettings,
      csvImportProfiles: csvImportProfilesCustom,
      excelExport,
    }),
    [
      artistMappings,
      compilationFilters,
      splitFees,
      manualRevenues,
      expenses,
      ignoredEntries,
      csvAliases,
      trackRevenueAssignments,
      appDefaults,
      emailConfig,
      labelBranding,
      pdfSettings,
      csvImportProfilesCustom,
      excelExport,
    ],
  )

  const applySettings = useCallback((bundle: SosAccountingSettings) => {
    setArtistMappings(bundle.artistMappings)
    setCompilationFilters(bundle.compilationFilters)
    setSplitFees(bundle.splitFees)
    setManualRevenues(bundle.manualRevenues)
    setExpenses(bundle.expenses)
    setIgnoredEntries(bundle.ignoredEntries)
    setCsvAliases(bundle.csvAliases)
    setTrackRevenueAssignments(bundle.trackRevenueAssignments)
    setAppDefaults(bundle.appDefaults)
    setEmailConfig(bundle.emailConfig)
    setLabelBranding(bundle.labelInfo ?? DEFAULT_LABEL_INFO)
    setPdfSettings(bundle.pdfSettings ?? DEFAULT_PDF_EXPORT_SETTINGS)
    setCsvImportProfilesCustom(bundle.csvImportProfiles ?? [])
    setExcelExport(bundle.excelExport ?? DEFAULT_EXCEL_EXPORT_STATE)
  }, [])

  const handleSubTabChange = useCallback((subTab: SubTab) => {
    if (subTab !== 'rules' && subTab !== 'analytics') previousWorkflowStep.current = subTab
    setActiveSubTab(subTab)
  }, [])
  const returnToWorkflow = useCallback(() => {
    setActiveSubTab(previousWorkflowStep.current)
  }, [])
  useEffect(() => {
    if (activeSubTab !== 'rules' && activeSubTab !== 'analytics') {
      previousWorkflowStep.current = activeSubTab
    }
  }, [activeSubTab])

  // Artist mapping handlers
  const handleAddMapping = useCallback((m: Omit<ArtistMapping, 'id'>) => {
    setArtistMappings(prev => [...prev, { ...m, id: uuidv4() }])
  }, [])
  const handleRemoveMapping = useCallback((id: string) => {
    setArtistMappings(prev => prev.filter(m => m.id !== id))
  }, [])
  const handleUpdateMapping = useCallback((id: string, m: Omit<ArtistMapping, 'id'>) => {
    setArtistMappings(prev => prev.map(e => e.id === id ? { ...m, id } : e))
  }, [])

  // Compilation filter handlers
  const handleAddFilter = useCallback((f: Omit<CompilationFilter, 'id'>) => {
    setCompilationFilters(prev => [...prev, { ...f, id: uuidv4() }])
  }, [])
  const handleRemoveFilter = useCallback((id: string) => {
    setCompilationFilters(prev => prev.filter(f => f.id !== id))
  }, [])
  const handleUpdateFilter = useCallback((id: string, update: Omit<CompilationFilter, 'id'>) => {
    setCompilationFilters(prev => prev.map(filter => filter.id === id ? { id, ...update } : filter))
  }, [])

  // Split fee handlers
  const handleAddSplitFee = useCallback((fee: SplitFee) => {
    setSplitFees(prev => [...prev.filter(f => f.artist !== fee.artist), fee])
  }, [])
  const handleRemoveSplitFee = useCallback((artist: string) => {
    setSplitFees(prev => prev.filter(f => f.artist !== artist))
  }, [])
  const handleUpdateSplitFee = useCallback((artist: string, update: Omit<SplitFee, 'artist'>) => {
    setSplitFees(prev => prev.map(f => f.artist === artist ? { artist, ...update } : f))
  }, [])

  // Manual revenue handlers
  const handleAddRevenue = useCallback((r: Omit<ManualRevenue, 'id'>) => {
    setManualRevenues(prev => [...prev, { ...r, id: uuidv4() }])
  }, [])
  const handleRemoveRevenue = useCallback((id: string) => {
    setManualRevenues(prev => prev.filter(r => r.id !== id))
  }, [])
  const handleUpdateRevenue = useCallback((id: string, r: Omit<ManualRevenue, 'id'>) => {
    setManualRevenues(prev => prev.map(e => e.id === id ? { ...r, id } : e))
  }, [])

  // Expense handlers
  const handleAddExpense = useCallback((e: Omit<ExpenseEntry, 'id'>) => {
    setExpenses(prev => [...prev, { ...e, id: uuidv4() }])
  }, [])
  const handleRemoveExpense = useCallback((id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }, [])
  const handleUpdateExpense = useCallback((id: string, e: Omit<ExpenseEntry, 'id'>) => {
    setExpenses(prev => prev.map(entry => entry.id === id ? { ...e, id } : entry))
  }, [])

  // Ignored entry handlers
  const handleAddIgnoredEntry = useCallback((e: Omit<IgnoredEntry, 'id' | 'createdAt'>) => {
    setIgnoredEntries(prev => [...prev, { ...e, id: uuidv4(), createdAt: new Date().toISOString() }])
  }, [])
  const handleRemoveIgnoredEntry = useCallback((id: string) => {
    setIgnoredEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  // CSV alias handlers
  const handleAddCsvAlias = useCallback((alias: Omit<CSVColumnAlias, 'id'>) => {
    setCsvAliases(prev => [...prev, { ...alias, id: uuidv4() }])
  }, [])
  const handleRemoveCsvAlias = useCallback((id: string) => {
    setCsvAliases(prev => prev.filter(a => a.id !== id))
  }, [])

  // Track revenue assignment handlers
  const handleAddTrackAssignment = useCallback((a: TrackRevenueAssignment) => {
    setTrackRevenueAssignments(prev => [...prev, a])
  }, [])
  const handleRemoveTrackAssignment = useCallback((id: string) => {
    setTrackRevenueAssignments(prev => prev.filter(a => a.id !== id))
  }, [])

  const persistImportedSettingsRef = useRef<
    ((next: SosAccountingSettings) => Promise<boolean>) | null
  >(null)

  const handleWorkspaceImport = useCallback((bundle: Partial<SosAccountingSettings>) => {
    const next = normalizeAccountingConfig({
      ...settingsBundle,
      ...bundle,
      labelInfo: { ...settingsBundle.labelInfo, ...bundle.labelInfo },
      pdfSettings: { ...settingsBundle.pdfSettings, ...bundle.pdfSettings },
      excelExport: bundle.excelExport ?? settingsBundle.excelExport,
    })
    applySettings(next)
    void persistImportedSettingsRef.current?.(next)
  }, [applySettings, settingsBundle])

  const handlePresetLoad = useCallback((preset: SosAccountingSettings) => {
    applySettings(mergePeriodScopedSettings(durableAccountingSettings(preset), settingsBundle))
  }, [applySettings, settingsBundle])

  // File managers for each source
  const believeManager   = useFileManager('believe')
  const bandcampManager  = useFileManager('bandcamp')
  const shopifyManager   = useFileManager('shopify')
  const printfulManager  = useFileManager('printful')
  const darkmerchManager = useFileManager('darkmerch')
  const [carryForwardByArtist, setCarryForwardByArtist] = useState<Record<string, number>>({})

  const ingestEvents = {
    onParseProgress: (progress: SosParseProgress) => {
      const patch: Partial<FileProcessingState> = {
        status: 'processing',
        phase: progress.phase === 'tokenizing' ? 'tokenizing' : 'parsing',
        progress: progress.percentage,
        processedRows: progress.processedRows,
        totalRows: progress.totalRows,
      }
      believeManager.patchFileState(progress.fileId, patch)
      bandcampManager.patchFileState(progress.fileId, patch)
      shopifyManager.patchFileState(progress.fileId, patch)
      printfulManager.patchFileState(progress.fileId, patch)
      darkmerchManager.patchFileState(progress.fileId, patch)
    },
    onParseDone: (stats: SosParseDoneStats) => {
      believeManager.applyParseResult(stats)
      bandcampManager.applyParseResult(stats)
      shopifyManager.applyParseResult(stats)
      printfulManager.applyParseResult(stats)
      darkmerchManager.applyParseResult(stats)
    },
    onParseError: (fileId: string, message: string) => {
      const patch: Partial<FileProcessingState> = {
        status: 'error',
        phase: 'error',
        progress: 0,
        error: message,
        bronzeStatus: 'skipped',
        bronzeError: 'Parsing failed. Correct the file and upload it again.',
      }
      believeManager.patchFileState(fileId, patch)
      bandcampManager.patchFileState(fileId, patch)
      shopifyManager.patchFileState(fileId, patch)
      printfulManager.patchFileState(fileId, patch)
      darkmerchManager.patchFileState(fileId, patch)
    },
  }

  // Restore a saved batch into its existing file card when present. If only
  // the workspace links the archive, add exactly one card without re-uploading.
  const loadBronzeBatch = useCallback(async (batch: {
    id: string
    distributor: string
    periodStart: string
    periodEnd?: string
    r2Key?: string
  }) => {
    const archivedName = batch.r2Key?.split('/').pop()?.replace(/^[a-f0-9]{12}_/i, '')
    const name = archivedName || `${batch.distributor}-${batch.periodStart || 'archive'}.csv`
    const manager = batch.distributor === 'believe' ? believeManager
      : batch.distributor === 'bandcamp' ? bandcampManager
      : batch.distributor === 'shopify' ? shopifyManager
      : batch.distributor === 'printful' ? printfulManager
      : batch.distributor === 'darkmerch' ? darkmerchManager
      : null
    if (!manager) throw new Error(`Unsupported distributor: ${batch.distributor}`)
    await manager.restoreArchivedBatch({
      id: batch.id,
      name,
      periodStart: batch.periodStart,
      periodEnd: batch.periodEnd,
    })
  }, [believeManager, bandcampManager, shopifyManager, printfulManager, darkmerchManager])

  // CSV processing — all config fields now wired
  const {
    isProcessing,
    excelBusy,
    revenues,
    processedData,
    detectedPeriodStart,
    detectedPeriodEnd,
    uniqueArtists,
    releaseTitlesByArtistIncFeaturing,
    territoryMetrics,
    merchOrderRows,
    requestExcelBlob,
    exchangeRatesLoading,
    exchangeRatesReady,
    exchangeRatesSource,
    exchangeRates,
    historicalRates,
    pipelineProgress,
    refreshExchangeRates,
  } = useCSVProcessor(
    believeManager.files,
    bandcampManager.files,
    {
      compilationFilters,
      artistMappings,
      splitFees,
      manualRevenues,
      expenses,
      excludePhysical: false,
      csvAliases,
      csvImportProfiles,
      labelArtists,
      ignoredEntries,
      distributionFeePercentage: appDefaults.distributionFeePercentage ?? 0,
      distributionFeeDigital:    appDefaults.distributionFeeDigital,
      distributionFeePhysical:   appDefaults.distributionFeePhysical,
      defaultSplitPercentage:    appDefaults.defaultSplitPercentage,
      defaultSplitPercentageDigital:  appDefaults.defaultSplitPercentageDigital,
      defaultSplitPercentagePhysical: appDefaults.defaultSplitPercentagePhysical,
      sourceSplits:              appDefaults.sourceSplits,
      trackRevenueAssignments,
      carryForwardByArtist,
    },
    shopifyManager.files,
    printfulManager.files,
    darkmerchManager.files,
    ingestEvents,
  )

  /**
   * The binding accounting period for every operation. Manual selection wins;
   * detected source months are provenance only. An invalid selection yields
   * `null` and blocks period-dependent actions — no replacement period.
   */
  const periodResolution = useMemo(
    () =>
      resolveAccountingPeriod({
        manualStart: manualPeriodStart,
        manualEnd: manualPeriodEnd,
        detectedStart: detectedPeriodStart,
        detectedEnd: detectedPeriodEnd,
      }),
    [manualPeriodStart, manualPeriodEnd, detectedPeriodStart, detectedPeriodEnd],
  )
  const effectivePeriod = periodResolution.period
  const effectivePeriodStart = effectivePeriod?.startMonth ?? ''
  const effectivePeriodEnd = effectivePeriod?.endMonth ?? ''
  const effectivePeriodStartDate = effectivePeriod?.startDate ?? ''
  const effectivePeriodEndDate = effectivePeriod?.endDate ?? ''
  useEffect(() => {
    if (!effectivePeriodStartDate || !effectivePeriodEndDate) {
      setCarryForwardByArtist({})
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const supabase = createBrowserSupabaseClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) return

        const params = new URLSearchParams({
          periodStart: effectivePeriodStartDate,
          periodEnd: effectivePeriodEndDate,
        })
        const response = await fetch(`/api/admin/settlements/register?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok || cancelled) return

        const json = (await response.json()) as {
          rows?: Array<{ artistName: string; openingBalanceEur?: number }>
        }
        const map: Record<string, number> = {}
        for (const row of json.rows ?? []) {
          if (row.openingBalanceEur != null && row.openingBalanceEur !== 0) {
            map[normalizeArtistNameKey(row.artistName)] = row.openingBalanceEur
          }
        }
        if (!cancelled) setCarryForwardByArtist(map)
      } catch {
        if (!cancelled) setCarryForwardByArtist({})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectivePeriodStartDate, effectivePeriodEndDate])

  // Derive flat list of all release titles across all artists for IgnoredEntriesManager
  const allReleaseTitles = useMemo(() => {
    const titles = new Set<string>()
    for (const releases of Object.values(releaseTitlesByArtistIncFeaturing ?? {})) {
      for (const t of releases) titles.add(t)
    }
    return Array.from(titles).sort()
  }, [releaseTitlesByArtistIncFeaturing])

  const hasData = revenues.length > 0

  useEffect(() => {
    if (detectedPeriodStart && !manualPeriodStart) {
      setManualPeriodStart(detectedPeriodStart)
      setManualPeriodEnd(detectedPeriodEnd || detectedPeriodStart)
    }
  }, [detectedPeriodStart, detectedPeriodEnd, manualPeriodStart])

  const resetSession = useCallback(() => {
    believeManager.clearAll()
    bandcampManager.clearAll()
    shopifyManager.clearAll()
    printfulManager.clearAll()
    darkmerchManager.clearAll()
    setCarryForwardByArtist({})
    toast.message(t.sessionResetTitle, {
      description: t.sessionResetDesc,
    })
  }, [
    believeManager,
    bandcampManager,
    shopifyManager,
    printfulManager,
    darkmerchManager,
    t.sessionResetTitle,
    t.sessionResetDesc,
  ])

  const sessionFiles = useMemo(
    () => [
      ...believeManager.files,
      ...bandcampManager.files,
      ...shopifyManager.files,
      ...printfulManager.files,
      ...darkmerchManager.files,
    ],
    [
      believeManager.files,
      bandcampManager.files,
      shopifyManager.files,
      printfulManager.files,
      darkmerchManager.files,
    ],
  )
  const unarchivedSourceFiles = useMemo(
    () => sessionFiles.filter((file) => !file.bronzeBatchId).map((file) => file.name),
    [sessionFiles],
  )

  const recoverableSessionFiles = useMemo(
    () => sessionFiles.filter((file) => file.bronzeBatchId && !file.data),
    [sessionFiles],
  )

  const bronzeBatchIds = useMemo(() => {
    const ids = new Set<string>()
    for (const file of sessionFiles) {
      if (file.bronzeBatchId) ids.add(file.bronzeBatchId)
    }
    return Array.from(ids)
  }, [sessionFiles])

  const exportPersistContext = useMemo(
    () =>
      hasData
        ? {
            territoryMetrics,
            merchOrderRows,
            revenues,
            bronzeBatchIds,
            sourceFileCount: sessionFiles.length,
            archivedFileCount: sessionFiles.length - unarchivedSourceFiles.length,
            unarchivedSourceFiles,
            rulesFingerprint: settingsFingerprint(settingsBundle),
            fxSnapshot: {
              rates: exchangeRates,
              historical: historicalRates,
              source: exchangeRatesSource,
            },
          }
        : undefined,
    [
      hasData,
      territoryMetrics,
      merchOrderRows,
      revenues,
      bronzeBatchIds,
      sessionFiles.length,
      unarchivedSourceFiles,
      settingsBundle,
      exchangeRates,
      historicalRates,
      exchangeRatesSource,
    ],
  )

  const preparePublishRef = useRef<() => Promise<boolean>>(async () => true)

  const {
    handleDownloadPDF,
    handleDownloadExcel,
    handleDownloadAll,
    handleDownloadSelected,
    handlePublishToPortal,
    buildCorrectionPdfBase64,
    excelFallback,
    resolveExcelFallback,
  } = useExports(
      processedData,
      labelInfo,
      effectivePeriodStart,
      effectivePeriodEnd,
      pdfSettings,
      appDefaults,
      labelArtists,
      emailConfig,
      compilationFilters,
      false,
      exportPersistContext,
      requestExcelBlob,
      () => preparePublishRef.current(),
    )

  const openExcelDialog = useCallback((
    target: { kind: 'one'; artist: string } | { kind: 'all' } | { kind: 'selected'; artists: string[] },
  ) => {
    setExcelDialogTarget(target)
    setExcelDialogOpen(true)
  }, [])

  const handleExcelDialogConfirm = useCallback((settings: ExcelExportSettings) => {
    const next = { ...excelExport, settings }
    setExcelExport(next)
    setExcelDialogOpen(false)
    const target = excelDialogTarget
    setExcelDialogTarget(null)
    if (!target) return
    if (target.kind === 'one') {
      void handleDownloadExcel(target.artist, settings)
      return
    }
    if (target.kind === 'all') {
      void handleDownloadAll(settings)
      return
    }
    void handleDownloadSelected(target.artists, settings)
  }, [excelExport, excelDialogTarget, handleDownloadAll, handleDownloadExcel, handleDownloadSelected])

  const requestExcelForArtist = useCallback((artist: string) => {
    openExcelDialog({ kind: 'one', artist })
  }, [openExcelDialog])

  const requestExcelAll = useCallback(() => {
    openExcelDialog({ kind: 'all' })
  }, [openExcelDialog])

  const requestExcelSelected = useCallback((artists: string[]) => {
    openExcelDialog({ kind: 'selected', artists })
  }, [openExcelDialog])

  const currentPeriodKey = useMemo(
    () =>
      effectivePeriod
        ? { start: effectivePeriod.startMonth, end: effectivePeriod.endMonth }
        : null,
    [effectivePeriod],
  )

  const {
    settingsReady,
    workspaceLoadedAt,
    workspaceUpdatedBy,
    defaultPresetLoadedAt,
    isWorkspaceLoading,
    isWorkspaceSaving,
    isSettingsDirty,
    workspaceConflict,
    serverBronzeBatchIds,
    loadFromServer,
    confirmReloadFromServer,
    reloadConfirmOpen,
    setReloadConfirmOpen,
    saveCurrentWorkspace,
    persistImportedSettings,
  } = useSosWorkspaceSync({
    currentPeriodKey,
    settings: settingsBundle,
    applySettings,
    bronzeBatchIds,
    disabled: isProcessing,
  })
  preparePublishRef.current = () => saveCurrentWorkspace({ silent: true })
  persistImportedSettingsRef.current = persistImportedSettings

  const confirmWorkspaceDelete = useCallback(async () => {
    if (!currentPeriodKey) return
    setWorkspaceDeleting(true)
    try {
      const res = await fetch(
        `/api/admin/sos/workspaces?periodStart=${encodeURIComponent(currentPeriodKey.start)}&periodEnd=${encodeURIComponent(currentPeriodKey.end)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Workspace delete failed',
        )
      }
      toast.success(t.workspaceDeletedSuccess)
      setWorkspaceDeleteOpen(false)
      await loadFromServer({ force: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Workspace delete failed')
    } finally {
      setWorkspaceDeleting(false)
    }
  }, [currentPeriodKey, loadFromServer, t])

  /** Restore missing CSV content, including already-listed files with archived IDs. */
  const restoreArchivedSources = useCallback(async () => {
    const unloaded = sessionFiles.filter((file) => file.bronzeBatchId && !file.data)
    const workspaceOnly = serverBronzeBatchIds.filter((id) => !bronzeBatchIds.includes(id))
    if (unloaded.length === 0 && workspaceOnly.length === 0) return
    setRestoringArchives(true)
    setRestoreProgress({ completed: 0, total: unloaded.length + workspaceOnly.length })
    let restored = 0
    let failed = 0
    try {
      // Sequential retrieval prevents large Believe archives exhausting memory
      // or bandwidth at the same time. A failed source doesn't stop the rest.
      for (const file of unloaded) {
        const manager = file.type === 'believe' ? believeManager
          : file.type === 'bandcamp' ? bandcampManager
          : file.type === 'shopify' ? shopifyManager
          : file.type === 'printful' ? printfulManager
          : darkmerchManager
        try {
          await manager.restoreArchivedFile(file.id)
          restored++
        } catch {
          failed++
        } finally {
          setRestoreProgress(previous => previous ? { ...previous, completed: previous.completed + 1 } : null)
        }
      }
      if (workspaceOnly.length > 0) {
        const supabase = createBrowserSupabaseClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error(t.workspaceLoadFailed)
        for (const batchId of workspaceOnly) {
          try {
            const res = await fetch(`/api/admin/sos/import-batches/${batchId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`Cannot read saved archive (${res.status})`)
            const json = (await res.json()) as { batch?: {
              id: string; distributor?: string; periodStart?: string
              periodEnd?: string; r2Key?: string; status?: string
            } }
            if (!json.batch?.distributor || json.batch.status !== 'completed') {
              throw new Error('The requested archive is not complete.')
            }
            await loadBronzeBatch({
              id: json.batch.id,
              distributor: json.batch.distributor,
              periodStart: json.batch.periodStart ?? '',
              periodEnd: json.batch.periodEnd,
              r2Key: json.batch.r2Key,
            })
            restored++
          } catch {
            failed++
          } finally {
            setRestoreProgress(previous => previous ? { ...previous, completed: previous.completed + 1 } : null)
          }
        }
      }
      if (restored > 0) toast.success(`${restored} saved file(s) loaded. Calculations are updating.`)
      if (failed > 0) toast.error(`${failed} file(s) could not be restored. Retry or select the original files.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.bronzeArchiveLoadError)
    } finally {
      setRestoringArchives(false)
      setRestoreProgress(null)
    }
  }, [
    sessionFiles,
    serverBronzeBatchIds,
    bronzeBatchIds,
    loadBronzeBatch,
    believeManager,
    bandcampManager,
    shopifyManager,
    printfulManager,
    darkmerchManager,
    t.workspaceLoadFailed,
    t.bronzeArchiveLoadError,
  ])

  const rulesCount =
    artistMappings.length + compilationFilters.length + splitFees.length +
    manualRevenues.length + expenses.length + ignoredEntries.length +
    csvAliases.length + trackRevenueAssignments.length

  const periodError =
    manualPeriodStart && manualPeriodEnd && !isValidPeriodRange(manualPeriodStart, manualPeriodEnd)
      ? t.setupPeriodOrderError
      : undefined

  const uploadPanel = (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full max-w-3xl min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <MonthField
            id="sos-period-start"
            label={t.setupPeriodFrom}
            value={manualPeriodStart}
            onChange={(value) => {
              setManualPeriodStart(value)
              if (!manualPeriodEnd || !isValidPeriodRange(value, manualPeriodEnd)) {
                setManualPeriodEnd(value)
              }
            }}
            required
            max={manualPeriodEnd || undefined}
          />
          <MonthField
            id="sos-period-end"
            label={t.setupPeriodTo}
            value={manualPeriodEnd}
            onChange={setManualPeriodEnd}
            required
            min={manualPeriodStart || undefined}
            error={periodError}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetSession}>
          {t.resetSessionLabel}
        </Button>
      </div>
      {unarchivedSourceFiles.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertDescription className="text-xs text-amber-400">
            {interpolate(t.validationIncompleteArchiveDesc, { files: unarchivedSourceFiles.join(', ') })}
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-md border border-border bg-muted/10 p-3 space-y-1">
        <p className="text-xs font-semibold text-foreground">{t.uploadHelpTitle}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{t.uploadHelpBody}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {interpolate(t.rosterFromDbHint, { count: labelArtists.length })}
      </p>
      {(recoverableSessionFiles.length > 0 ||
        serverBronzeBatchIds.some((id) => !bronzeBatchIds.includes(id))) && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {t.uiArchiveNotLoaded}: {recoverableSessionFiles.length + serverBronzeBatchIds.filter(id => !bronzeBatchIds.includes(id)).length}
            </p>
            <p className="text-xs text-muted-foreground">{t.uiArchiveRestoreHint}</p>
            {restoreProgress && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {t.uiArchiveRestoreProgress.replace('{done}', String(restoreProgress.completed)).replace('{total}', String(restoreProgress.total))}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void restoreArchivedSources()}
            disabled={restoringArchives || isProcessing}
          >
            {restoringArchives ? t.workspaceLoading : t.uiArchiveRestoreAll}
          </Button>
        </div>
      )}
      <UniversalFileUploadZone
        believeManager={believeManager}
        bandcampManager={bandcampManager}
        shopifyManager={shopifyManager}
        printfulManager={printfulManager}
        darkmerchManager={darkmerchManager}
        csvProfiles={csvImportProfiles}
        isProcessing={isProcessing}
        pipelineProgress={pipelineProgress}
        onAddAliases={(aliases) => {
          aliases.forEach((alias) => handleAddCsvAlias(alias))
        }}
        onSaveProfile={saveCsvProfile}
      />
      <section className="space-y-3 border-t border-border pt-4" aria-label={t.uiBrowseArchives}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t.uiBrowseArchives}</h3>
            <p className="text-xs text-muted-foreground">{t.uiArchiveRestoreHint}</p>
          </div>
          <Button type="button" variant="outline" size="sm"
            aria-expanded={showArchiveRegistry}
            onClick={() => setShowArchiveRegistry(open => !open)}>
            {showArchiveRegistry ? t.uiHideArchives : t.uiBrowseArchives}
          </Button>
        </div>
        {showArchiveRegistry && (
          <ImportBatchesPanel
            labelArtists={labelArtists}
            onLoadBatch={loadBronzeBatch}
            exchangeRates={exchangeRates}
            historicalRates={historicalRates ?? undefined}
            carryForwardByArtist={carryForwardByArtist}
          />
        )}
      </section>
    </div>
  )

  const reviewPanel = hasData ? (
    <ReportingPanel
      revenues={revenues}
      onDownloadPDF={handleDownloadPDF}
      onDownloadExcel={requestExcelForArtist}
      onDownloadAll={requestExcelAll}
      onDownloadSelected={requestExcelSelected}
      labelArtists={labelArtists}
      labelInfo={labelInfo}
      appDefaults={appDefaults}
      splitFees={splitFees}
      emailConfig={emailConfig}
      periodStart={effectivePeriodStart}
      periodEnd={effectivePeriodEnd}
      onGoToSettlementCenter={() => setActiveSubTab('settlements')}
      disabled={isProcessing || excelBusy}
    />
  ) : (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <FileText size={32} className="opacity-30" />
      <p className="text-sm">{t.emptyReporting}</p>
    </div>
  )

  // The settlement center opens from the database for a resolved period even
  // without a CSV upload session (contract §B.2/#617).
  const settlePanel = effectivePeriod ? (
    <div className="space-y-4">
      <div className="px-6 pt-4 space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{t.settlementDauIntro}</p>
        {unarchivedSourceFiles.length > 0 && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertDescription className="text-xs text-amber-400">
              {interpolate(t.validationIncompleteArchiveDesc, { files: unarchivedSourceFiles.join(', ') })}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <SettlementCenterPanel
        revenues={revenues}
        labelArtists={labelArtists}
        periodStart={effectivePeriodStart}
        periodEnd={effectivePeriodEnd}
        territoryMetrics={territoryMetrics}
        merchOrderRows={merchOrderRows}
        bronzeBatchIds={bronzeBatchIds}
        persistDisabled={isProcessing || unarchivedSourceFiles.length > 0}
        onCreateDraft={handlePublishToPortal}
        onBuildCorrectionPdf={buildCorrectionPdfBase64}
      />
      <div className="px-6 pb-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{t.subTabPayout}</h3>
        <PayoutManager
          labelArtists={labelArtists}
          labelInfo={labelInfo}
          periodStart={effectivePeriodStart}
          periodEnd={effectivePeriodEnd}
          onLabelSepaUpdate={handleLabelSepaUpdate}
        />
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <SealCheck size={32} className="opacity-30" />
      <p className="text-sm">{t.emptySettlements}</p>
    </div>
  )

  // ── Step 2: Checks ──────────────────────────────────────────────────────────

  const validationIssues = useMemo(
    () =>
      validateSosWizardState(
        {
          revenues,
          labelArtists,
          splitFees,
          periodStart: effectivePeriodStart,
          periodEnd: effectivePeriodEnd,
          hasBelieveFile: believeManager.files.length > 0,
          hasBandcampFile: bandcampManager.files.length > 0,
          hasShopifyFile: shopifyManager.files.length > 0,
          hasPrintfulFile: printfulManager.files.length > 0,
          hasDarkmerchFile: darkmerchManager.files.length > 0,
          trackRevenueAssignments,
          skippedRowCount: sessionFiles.reduce((sum, file) => sum + (file.rowsSkipped ?? 0), 0),
          skipReasons: [...new Set(sessionFiles.flatMap((file) => file.skipReasons ?? []))],
          emptyCurrencyRowCount: sessionFiles.reduce(
            (sum, file) => sum + (file.emptyCurrencyRows ?? 0),
            0,
          ),
          unarchivedSourceFiles,
        },
        t,
      ),
    [
      revenues,
      labelArtists,
      splitFees,
      effectivePeriodStart,
      effectivePeriodEnd,
      believeManager.files.length,
      bandcampManager.files.length,
      shopifyManager.files.length,
      printfulManager.files.length,
      darkmerchManager.files.length,
      trackRevenueAssignments,
      sessionFiles,
      unarchivedSourceFiles,
      t,
    ],
  )

  const hasBlockingValidation = useMemo(
    () => validationIssues.some((issue) => issue.severity === 'error'),
    [validationIssues],
  )

  const validatePanel = (
    <SosValidationPanel
      issues={validationIssues}
      onIssueAction={(issue) => {
        if (issue.actionTarget === 'settlements') {
          setActiveSubTab('settlements')
          return
        }
        if (
          issue.actionTarget === 'rules-mappings' ||
          issue.actionTarget === 'rules-splits' ||
          issue.actionTarget === 'rules-defaults'
        ) {
          setActiveRuleTab(
            issue.actionTarget === 'rules-mappings' ? 'mappings' :
            issue.actionTarget === 'rules-splits' ? (issue.id.startsWith('track-split-') ? 'track-splits' : 'splits') : 'defaults'
          )
          setActiveSubTab('rules')
          return
        }
        setActiveSubTab('upload')
      }}
    />
  )

  const wizardStep: GuidedWizardStep =
    activeSubTab === 'validate'
      ? 'validate'
      : activeSubTab === 'reporting'
        ? 'review'
        : activeSubTab === 'settlements'
          ? 'settle'
          : 'upload'

  const secondaryView = activeSubTab === 'rules' || activeSubTab === 'analytics'

  const handleImportReady = useCallback(() => {
    toast.success(t.importReadyTitle, { description: t.importReadyDesc })
  }, [t.importReadyTitle, t.importReadyDesc])

  const currencyBanner = (
    <CurrencyRatesBanner
      loading={exchangeRatesLoading}
      source={exchangeRatesSource}
      onRefresh={refreshExchangeRates}
    />
  )

  const rulesStatusBanner = settingsReady ? (
    <p className="border-b border-border bg-muted/10 px-4 py-2 text-xs text-muted-foreground sm:px-6" role="status">
      {workspaceConflict ? (
        <span className="text-destructive">
          {t.workspaceConflict}{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void confirmReloadFromServer()}
          >
            {t.workspaceReload}
          </button>
        </span>
      ) : isWorkspaceSaving
        ? t.rulesWorkspaceSaving
        : isSettingsDirty
          ? t.rulesWorkspaceDirty
          : !currentPeriodKey
            ? `${t.rulesWorkspaceDefaultSynced}${defaultPresetLoadedAt ? ` · ${new Date(defaultPresetLoadedAt).toLocaleString()}` : ''}`
            : `${t.rulesWorkspaceSynced}${workspaceLoadedAt ? ` · ${new Date(workspaceLoadedAt).toLocaleString()}${workspaceUpdatedBy ? ` · ${workspaceUpdatedBy.slice(0, 8)}` : ''}` : ''}`}
    </p>
  ) : null

  const periodBanner = effectivePeriod ? (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card/40 px-4 py-2 text-sm sm:mx-6" role="status">
      <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{t.uploadPeriodLabel}</span>
      <strong className="tabular-nums font-semibold text-foreground">
        {effectivePeriod.startMonth} – {effectivePeriod.endMonth}
      </strong>
      {isProcessing && (
        <span className="text-xs text-muted-foreground">
          {pipelineProgress ? `${pipelineProgress.phase} ${pipelineProgress.percentage}%` : t.processing}
        </span>
      )}
    </div>
  ) : null

  const excelExportDialog = (
    <ExcelExportDialog
      open={excelDialogOpen}
      onOpenChange={(open) => {
        setExcelDialogOpen(open)
        if (!open) setExcelDialogTarget(null)
      }}
      state={excelExport}
      onStateChange={setExcelExport}
      onConfirm={handleExcelDialogConfirm}
      disabled={isProcessing || excelBusy}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-0">
      {currencyBanner}
      {/* Primary destinations stay separate from tools for the current workspace. */}
      <div className="border-b border-border bg-card/20 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label={t.subTabListLabel} className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={!secondaryView ? 'secondary' : 'ghost'}
              size="sm"
              className="min-h-9 gap-2 text-sm"
              aria-current={!secondaryView ? 'page' : undefined}
              onClick={returnToWorkflow}
            >
              <Wallet size={16} aria-hidden="true" />
              {t.accountingWorkflow}
            </Button>
            <Button
              type="button"
              variant={activeSubTab === 'rules' ? 'secondary' : 'ghost'}
              size="sm"
              className="min-h-9 gap-2 text-sm"
              aria-current={activeSubTab === 'rules' ? 'page' : undefined}
              onClick={() => handleSubTabChange('rules')}
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              {t.subTabRules}
              {rulesCount > 0 && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {rulesCount}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant={activeSubTab === 'analytics' ? 'secondary' : 'ghost'}
              size="sm"
              className="min-h-9 gap-2 text-sm"
              aria-current={activeSubTab === 'analytics' ? 'page' : undefined}
              onClick={() => handleSubTabChange('analytics')}
            >
              <ChartBar size={16} aria-hidden="true" />
              {t.subTabAnalytics}
            </Button>
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="min-h-9 gap-2 text-sm">
                <GearSix size={16} aria-hidden="true" />
                {t.accountingTools}
                <CaretDown size={13} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => setSettingsPanel('presets')}>
                <BookmarkSimple size={16} aria-hidden="true" /> {t.presets}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsPanel('csv')}>
                <Table size={16} aria-hidden="true" /> {t.csvProfiles}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsPanel('pdf')}>
                <FileText size={16} aria-hidden="true" /> {t.pdfSettings}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsPanel('workspace')}>
                <DownloadSimple size={16} aria-hidden="true" /> {t.workspaceTitle}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Sheet open={settingsPanel === 'presets'} onOpenChange={(open) => setSettingsPanel(open ? 'presets' : null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-lenis-prevent>
          <SheetHeader><SheetTitle>{t.presetsTitle}</SheetTitle></SheetHeader>
          <div className="mt-6">
            <CsvProfileManager
              artistMappings={artistMappings}
              compilationFilters={compilationFilters}
              splitFees={splitFees}
              manualRevenues={manualRevenues}
              expenses={expenses}
              ignoredEntries={ignoredEntries}
              csvAliases={csvAliases}
              trackRevenueAssignments={trackRevenueAssignments}
              appDefaults={appDefaults}
              emailConfig={emailConfig}
              labelInfo={labelBranding}
              pdfSettings={pdfSettings}
              csvImportProfiles={csvImportProfilesCustom}
              excelExport={excelExport}
              onLoad={handlePresetLoad}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={settingsPanel === 'csv'} onOpenChange={(open) => setSettingsPanel(open ? 'csv' : null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-lenis-prevent>
          <SheetHeader><SheetTitle>{t.csvProfilesTitle}</SheetTitle></SheetHeader>
          <div className="mt-6">
            <CsvImportProfileEditor
              profiles={csvImportProfiles}
              customProfiles={customProfiles}
              shadowedProfiles={shadowedProfiles}
              nameConflicts={nameConflicts}
              onSave={saveCsvProfile}
              onDelete={deleteCsvProfile}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={settingsPanel === 'workspace'} onOpenChange={(open) => setSettingsPanel(open ? 'workspace' : null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-lenis-prevent>
          <SheetHeader><SheetTitle>{t.workspaceTitle}</SheetTitle></SheetHeader>
          <div className="mt-6">
            <WorkspaceManager
              appDefaults={appDefaults}
              emailConfig={emailConfig}
              artistMappings={artistMappings}
              compilationFilters={compilationFilters}
              splitFees={splitFees}
              manualRevenues={manualRevenues}
              expenses={expenses}
              ignoredEntries={ignoredEntries}
              csvAliases={csvAliases}
              trackRevenueAssignments={trackRevenueAssignments}
              labelInfo={labelBranding}
              pdfSettings={pdfSettings}
              csvImportProfiles={csvImportProfilesCustom}
              excelExport={excelExport}
              onImport={handleWorkspaceImport}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={settingsPanel === 'pdf'} onOpenChange={(open) => setSettingsPanel(open ? 'pdf' : null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-lenis-prevent>
          <SheetHeader><SheetTitle>{t.pdfSettings}</SheetTitle></SheetHeader>
          <div className="mt-6">
            <PdfExportSettingsPanel settings={pdfSettings} onUpdate={setPdfSettings} />
          </div>
        </SheetContent>
      </Sheet>

      {periodBanner}

      {rulesStatusBanner}

      {/* Billing flow: Files → Checks → Amounts → Statements */}
      <div className="min-h-[500px] min-w-0">
        {!secondaryView && (
          <AccountingGuidedWizard
            hasData={hasData}
            isProcessing={isProcessing}
            activeStep={wizardStep}
            onActiveStepChange={(step) => handleSubTabChange(SUB_TAB_BY_WIZARD_STEP[step])}
            onImportReady={handleImportReady}
            hasBlockingValidation={hasBlockingValidation}
            ratesReady={exchangeRatesReady}
            labels={recoverableSessionFiles.length > 0
              ? { blockedUploadNoData: t.uiArchiveRestoreHint }
              : undefined}
            uploadPanel={uploadPanel}
            validatePanel={validatePanel}
            reviewPanel={reviewPanel}
            settlePanel={settlePanel}
          />
        )}

        {secondaryView && (
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-foreground">
              {activeSubTab === 'rules' ? t.subTabRules : t.subTabAnalytics}
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={returnToWorkflow}
            >
              <ArrowLeft size={13} aria-hidden="true" /> {t.guidedBack}
            </Button>
          </div>
        )}

        {activeSubTab === 'analytics' && (
          <div id="accounting-analytics-panel" className="p-6 space-y-6">
            <section className="space-y-4" aria-labelledby="analytics-ops-heading">
              <h3 id="analytics-ops-heading" className="text-sm font-semibold text-foreground">
                {t.analyticsOpsHeading}
              </h3>

              {/* Enterprise collaborative workspace controls */}
              <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/10 p-2 text-xs">
                <span className="font-medium text-foreground">{t.workspaceServer ?? 'Workspace (server):'}</span>
                {currentPeriodKey ? (
                  workspaceLoadedAt ? (
                    <span className="text-muted-foreground">
                      {t.workspaceLastSaved ?? 'last saved'} {new Date(workspaceLoadedAt).toLocaleString()} {workspaceUpdatedBy ? `· ${workspaceUpdatedBy.slice(0, 8)}` : ''}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.workspaceNotSaved ?? 'not yet saved for this period'}</span>
                  )
                ) : defaultPresetLoadedAt ? (
                  <span className="text-muted-foreground">
                    {t.workspaceDefaultSaved ?? 'Default preset saved'} {new Date(defaultPresetLoadedAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t.workspaceDefaultNotSaved ?? 'Default preset not saved yet'}</span>
                )}
                <button
                  type="button"
                  onClick={() => void loadFromServer()}
                  disabled={isWorkspaceLoading || isProcessing}
                  className="rounded border px-2 py-0.5 hover:bg-background disabled:opacity-50"
                >
                  {isWorkspaceLoading ? (t.workspaceLoading ?? 'Loading…') : (t.workspaceReload ?? 'Reload from server')}
                </button>
                <button
                  type="button"
                  onClick={() => void saveCurrentWorkspace()}
                  disabled={isWorkspaceSaving || isProcessing}
                  className="rounded bg-primary px-2 py-0.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isWorkspaceSaving
                    ? (t.workspaceSaving ?? 'Saving…')
                    : currentPeriodKey
                      ? (t.workspaceSave ?? 'Save workspace to server')
                      : (t.workspaceSaveDefault ?? 'Save default preset')}
                </button>
                {currentPeriodKey && (
                  <button
                    type="button"
                    disabled={isWorkspaceLoading || isProcessing || workspaceDeleting}
                    onClick={() => setWorkspaceDeleteOpen(true)}
                    className="rounded border border-destructive/40 px-2 py-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {t.workspaceDeleteTitle}
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {currentPeriodKey
                    ? (t.workspaceSharedHint ?? 'Shared across team · period-keyed')
                    : (t.workspaceDefaultHint ?? 'Shared default settings until a period is detected')}
                </span>
              </div>

              <OperatorPlaybook
                title={t.playbookTitle}
                step1={t.playbookStep1}
                step2={t.playbookStep2}
                step3={t.playbookStep3}
              />
              <ImportBatchesPanel
                labelArtists={labelArtists}
                onLoadBatch={loadBronzeBatch}
                exchangeRates={exchangeRates}
                historicalRates={historicalRates ?? undefined}
                carryForwardByArtist={carryForwardByArtist}
              />
              <ExternalMetricsSyncPanel />
              <ApifySpotifySyncPanel />
              {hasData ? (
                <SosAnalyticsPersistPanel
                  periodStart={effectivePeriodStart}
                  periodEnd={effectivePeriodEnd}
                  territoryMetrics={territoryMetrics}
                  merchOrderRows={merchOrderRows}
                  labelArtists={labelArtists}
                  revenues={revenues}
                  bronzeBatchIds={bronzeBatchIds}
                  disabled={isProcessing}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3 border border-dashed border-border rounded-lg">
                  <ChartBar size={32} className="opacity-30" />
                  <p className="text-sm">{t.emptyAnalytics}</p>
                </div>
              )}
            </section>

            {hasData && (
              <section className="space-y-4" aria-labelledby="analytics-preview-heading">
                <div className="space-y-2">
                  <h3 id="analytics-preview-heading" className="text-sm font-semibold text-foreground">
                    {t.analyticsPreviewHeading}
                  </h3>
                  <Alert className="border-amber-500/30 bg-amber-500/5">
                    <ChartBar size={14} className="text-amber-600" />
                    <AlertDescription className="text-xs">{t.analyticsSessionBanner}</AlertDescription>
                  </Alert>
                </div>
                <AdminEnterpriseAnalytics
                  revenues={revenues}
                  periodStart={effectivePeriodStart}
                  periodEnd={effectivePeriodEnd}
                />
              </section>
            )}

            <section className="space-y-3" aria-labelledby="analytics-trends-heading">
              <h3 id="analytics-trends-heading" className="text-sm font-semibold text-foreground">
                {t.subTabTrends}
              </h3>
              <TrendsDashboard
                revenues={revenues}
                periodStart={effectivePeriodStart}
                periodEnd={effectivePeriodEnd}
                bronzeBatchIds={bronzeBatchIds}
              />
            </section>
          </div>
        )}

        {activeSubTab === 'rules' && (
          <div id="accounting-rules-panel">
          <RulesPanel
            activeRuleTab={activeRuleTab}
            onRuleTabChange={setActiveRuleTab}
            artistMappings={artistMappings}
            compilationFilters={compilationFilters}
            splitFees={splitFees}
            manualRevenues={manualRevenues}
            expenses={expenses}
            ignoredEntries={ignoredEntries}
            csvAliases={csvAliases}
            trackRevenueAssignments={trackRevenueAssignments}
            appDefaults={appDefaults}
            emailConfig={emailConfig}
            labelInfo={labelInfo}
            onUpdateLabelInfo={handleLabelInfoUpdate}
            onAddArtistMapping={handleAddMapping}
            onRemoveArtistMapping={handleRemoveMapping}
            onUpdateArtistMapping={handleUpdateMapping}
            onAddCompilationFilter={handleAddFilter}
            onRemoveCompilationFilter={handleRemoveFilter}
            onUpdateCompilationFilter={handleUpdateFilter}
            onAddSplitFee={handleAddSplitFee}
            onRemoveSplitFee={handleRemoveSplitFee}
            onUpdateSplitFee={handleUpdateSplitFee}
            onAddManualRevenue={handleAddRevenue}
            onRemoveManualRevenue={handleRemoveRevenue}
            onUpdateManualRevenue={handleUpdateRevenue}
            onAddExpense={handleAddExpense}
            onRemoveExpense={handleRemoveExpense}
            onUpdateExpense={handleUpdateExpense}
            onAddIgnoredEntry={handleAddIgnoredEntry}
            onRemoveIgnoredEntry={handleRemoveIgnoredEntry}
            onAddCsvAlias={handleAddCsvAlias}
            onRemoveCsvAlias={handleRemoveCsvAlias}
            onAddTrackAssignment={handleAddTrackAssignment}
            onRemoveTrackAssignment={handleRemoveTrackAssignment}
            onUpdateAppDefaults={setAppDefaults}
            onUpdateEmailConfig={setEmailConfig}
            availableArtists={uniqueArtists ?? []}
            availableReleases={allReleaseTitles}
          />
          </div>
        )}
      </div>

      <SosConfirmDialog
        open={reloadConfirmOpen}
        onOpenChange={setReloadConfirmOpen}
        title={t.workspaceReloadConfirmTitle}
        description={t.workspaceReloadConfirmBody}
        confirmLabel={t.workspaceReloadConfirm}
        cancelLabel={t.commonCancel}
        loading={isWorkspaceLoading}
        onConfirm={() => void confirmReloadFromServer()}
      />

      <SosConfirmDialog
        open={workspaceDeleteOpen}
        onOpenChange={setWorkspaceDeleteOpen}
        title={t.workspaceDeleteTitle}
        description={
          currentPeriodKey
            ? t.workspaceDeleteDesc
                .replaceAll('{start}', currentPeriodKey.start)
                .replaceAll('{end}', currentPeriodKey.end)
            : ''
        }
        confirmLabel={t.workspaceDeleteConfirm}
        cancelLabel={t.commonCancel}
        destructive
        loading={workspaceDeleting}
        onConfirm={confirmWorkspaceDelete}
      />
      {excelExportDialog}

      <ExcelExportFallbackDialog
        open={excelFallback !== null}
        title={t.excelFallbackTitle}
        description={excelFallback?.reason ?? ''}
        retryLabel={t.excelFallbackRetry}
        summaryOnlyLabel={t.excelFallbackSummaryOnly}
        cancelLabel={t.excelFallbackCancel}
        onRetry={() => void resolveExcelFallback('retry')}
        onSummaryOnly={() => void resolveExcelFallback('summary')}
        onCancel={() => void resolveExcelFallback('cancel')}
      />
    </div>
  )
}

export function AccountingPanel() {
  const t = useAccountingLabels()
  const tAudit = useTranslations('admin.accounting.dataAudit')

  return (
    <Tabs defaultValue="generate" className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <TabsList className="h-10">
          <TabsTrigger value="generate" className="min-h-9 gap-2 text-sm">
            <Wallet size={14} />
            {t.tabGenerate}
          </TabsTrigger>
          <TabsTrigger value="history" className="min-h-9 gap-2 text-sm">
            <ClockCounterClockwise size={14} />
            {t.tabHistory}
          </TabsTrigger>
        </TabsList>
        <Link
          href="/admin/accounting/data-audit"
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <MagnifyingGlass size={14} />
          {tAudit('title')}
        </Link>
      </div>

      <TabsContent value="generate" className="flex-1 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
        <Suspense fallback={<Skeleton className="h-96 w-full m-6" />}>
          <SosGeneratorPanel />
        </Suspense>
      </TabsContent>

      <TabsContent value="history" className="flex-1 mt-0 p-6">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <StatementsManager readOnly settlementHref="/admin/accounting?subTab=settlements" />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
