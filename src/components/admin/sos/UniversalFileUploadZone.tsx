'use client'

import { useTranslations } from 'next-intl'
/**

 * UniversalFileUploadZone
 *
 * A single drop zone that accepts CSV files and auto-detects their format by
 * inspecting the CSV header row:
 *  - Header contains "Sales Month" AND "ISRC"        → believe
 *  - Header contains "bandcamp transaction id"        → bandcamp
 *  - Shopify / Printful / Darkmerch headers           → ecommerce managers
 *  - Otherwise                                       → opens a mapping dialog
 *    so the user can assign Artist, Revenue and Date columns manually.
 *
 * Artist roster is never imported from CSV — SOS uses the portal database roster.
 * All detected financial files are routed to the correct file-manager callback.
 */

import {
  UploadSimple,
  FileCsv,
  X,
  Spinner,
  ArrowsClockwise,
  CheckCircle,
  Warning,
  WarningCircle,
  Info,
  CloudArrowUp,
  CloudArrowDown,
} from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import type { UploadedFile, FileProcessingState } from '@/lib/sos/types'
import { formatBytes, formatInteger, type SosProcessProgress } from '@/lib/sos/ingestProgress'
import { interpolate } from '@/lib/i18n/interpolate'
import { fingerprintHeaders, parseImportSample, readImportSample, readXlsxAsCsv, sanitizeAiSample, type ImportSample } from '@/lib/sos/ingest/importSample'
import { matchProfile } from '@/lib/sos/ingest/parser-facade'
import {
  SYSTEM_SHOPIFY_PROFILE_ID,
  SYSTEM_PRINTFUL_PROFILE_ID,
  SYSTEM_BANDCAMP_PROFILE_ID,
  SYSTEM_BANDCAMP_DDS_PROFILE_ID,
  SYSTEM_DARKMERCH_PROFILE_ID,
} from '@/lib/sos/ingest/default-profiles'
import { suggestColumnMappings } from '@/lib/sos/ingest/columnMappingSuggestions'
import type { CsvImportProfile, FinancialFieldKey, ImportDateSemantics, ImportDateOrder, ImportParserSource } from '@/lib/sos/ingest/types'

const OPTIONAL_FIELDS: Array<{ field: FinancialFieldKey; label: string }> = [
  { field: 'currency', label: 'Currency' },
  { field: 'quantity', label: 'Quantity' },
  { field: 'platform', label: 'Platform' },
  { field: 'country', label: 'Country' },
  { field: 'releaseTitle', label: 'Release' },
  { field: 'trackTitle', label: 'Track' },
  { field: 'releaseType', label: 'Release type' },
  { field: 'isrc', label: 'ISRC' },
  { field: 'upcEan', label: 'UPC / EAN' },
  { field: 'catalogNumber', label: 'Catalogue number' },
]

const AI_FIELD_TO_PROFILE: Record<string, FinancialFieldKey> = {
  artist_name: 'artistName', net_revenue: 'netRevenue', sales_month: 'salesMonth',
  release_title: 'releaseTitle', track_title: 'trackTitle', quantity: 'quantity',
  currency: 'currency', platform: 'platform', country: 'country',
  isrc: 'isrc', upc_ean: 'upcEan', catalog_number: 'catalogNumber',
  release_type: 'releaseType',
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileManagerCallbacks {
  files: UploadedFile[]
  fileStates: Record<string, FileProcessingState>
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  replaceFile: (id: string, file: File) => void
  retryArchive?: (id: string) => void
  prepareProfileRepair?: (id: string) => void
  restoreArchivedFile?: (id: string) => Promise<void>
}

/**
 * Minimal manager interface for e-commerce upload zones (Shopify / Printful).
 *
 * E-commerce managers do not expose `fileStates` or `replaceFile` because their
 * underlying parsers produce raw order buffers (not SalesTransactions), and
 * replacing a single file would silently break the Shopify↔Printful reconciliation.
 * Users should remove and re-add files instead.
 */
export interface EcommerceManagerCallbacks {
  files: UploadedFile[]
  fileStates?: Record<string, FileProcessingState>
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  retryArchive?: (id: string) => void
  prepareProfileRepair?: (id: string) => void
  restoreArchivedFile?: (id: string) => Promise<void>
}

interface UniversalFileUploadZoneProps {
  believeManager: FileManagerCallbacks
  bandcampManager: FileManagerCallbacks
  /** Manager for Shopify orders export CSVs. */
  shopifyManager: EcommerceManagerCallbacks
  /** Manager for Printful orders export CSVs. */
  printfulManager: EcommerceManagerCallbacks
  /** Manager for Darkmerch orders export CSVs. */
  darkmerchManager: EcommerceManagerCallbacks
  /** Confirmed profiles are saved to the current accounting workspace. */
  onSaveProfile: (profile: CsvImportProfile) => Promise<void>
  isProcessing?: boolean
  pipelineProgress?: SosProcessProgress | null
  /**
   * Active CSV import profiles used for header-based auto-detection.
   * When provided, profile matching is attempted before the legacy heuristic.
   * Master-data / artist-roster profiles are ignored (roster comes from the DB).
   */
  csvProfiles?: CsvImportProfile[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function humanizeError(error: string | undefined): string {
  if (!error) return 'Processing failed'
  if (error.toLowerCase().includes('call stack') || error.toLowerCase().includes('maximum'))
    return 'File is too large. Try splitting it into smaller files (< 100k rows each).'
  if (error.toLowerCase().includes('quota') || error.toLowerCase().includes('storage'))
    return 'Browser storage is full. Clear some data or use a smaller file.'
  if (error.toLowerCase().includes('encoding') || error.toLowerCase().includes('utf'))
    return 'File encoding issue. Save the CSV as UTF-8 and try again.'
  return error.length > 120 ? `${error.substring(0, 120)}…` : error
}

/**
 * Reads the header row of a File without loading the whole file into memory.
 * Returns the detected source type or 'unknown'.
 *
 * Detection order:
 *  1. Profile-based matching (when profiles are provided).
 *  2. Legacy hardcoded heuristics as fallback.
 */
async function detectCSVSource(
  file: File,
  profiles: CsvImportProfile[]
): Promise<{
  source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch' | 'profile-financial' | 'unknown'
  headers: string[]
  sample: ImportSample
  matchedProfile?: CsvImportProfile
}> {
  const sample = await readImportSample(file)
  const rawHeaders = sample.headers
  const normalizedHeaders = rawHeaders.map(h => h.toLowerCase())

  // ── Phase 1: Profile-based matching (financial only) ─────────────────────
  if (profiles.length > 0) {
    const financialProfiles = profiles.filter((p) => p.type !== 'master-data')
    const matched = matchProfile(rawHeaders, financialProfiles)
    if (matched) {
      if (matched.id === SYSTEM_SHOPIFY_PROFILE_ID) {
        return { source: 'shopify', headers: rawHeaders, sample, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_PRINTFUL_PROFILE_ID) {
        return { source: 'printful', headers: rawHeaders, sample, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_BANDCAMP_PROFILE_ID || matched.id === SYSTEM_BANDCAMP_DDS_PROFILE_ID) {
        return { source: 'bandcamp', headers: rawHeaders, sample, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_DARKMERCH_PROFILE_ID) {
        return { source: 'darkmerch', headers: rawHeaders, sample, matchedProfile: matched }
      }
      // Any other financial profile routes to the generic believe parser
      return { source: 'profile-financial', headers: rawHeaders, sample, matchedProfile: matched }
    }
  }

  // ── Phase 2: Legacy hardcoded heuristics ─────────────────────────────────
  if (normalizedHeaders.some(h => h === 'bandcamp transaction id')) {
    return { source: 'bandcamp', headers: normalizedHeaders, sample }
  }
  if (
    normalizedHeaders.some((h) => h.includes('sales month')) &&
    normalizedHeaders.some((h) => h === 'isrc')
  ) {
    return { source: 'believe', headers: normalizedHeaders, sample }
  }
  // Darkmerch CSV: has BAND and NET REVENUE columns
  if (normalizedHeaders.some(h => h === 'band') && normalizedHeaders.some(h => h === 'net revenue')) {
    return { source: 'darkmerch', headers: rawHeaders, sample }
  }
  // Artist roster CSVs are intentionally not auto-detected — roster comes from the portal DB.
  return { source: 'unknown', headers: rawHeaders, sample }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FileStatusIcon({ state, hasData, archived }: { state: FileProcessingState | undefined; hasData: boolean; archived: boolean }) {
  if (state?.status === 'error') return <WarningCircle size={16} className="text-destructive flex-shrink-0" />
  if (
    state?.status === 'uploading' ||
    state?.status === 'processing' ||
    state?.bronzeStatus === 'uploading'
  )
    return <Spinner size={16} className="text-primary animate-spin flex-shrink-0" />
  if (state?.bronzeStatus === 'error' || state?.bronzeStatus === 'skipped')
    return <Warning size={16} className="text-amber-400 flex-shrink-0" />
  if (!hasData && archived) return <CloudArrowDown size={16} className="text-muted-foreground flex-shrink-0" />
  if (!hasData) return <Warning size={16} className="text-amber-400 flex-shrink-0" />
  return <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
}

function FileProgressBar({ state }: { state: FileProcessingState | undefined }) {
  const t = useTranslations('admin.accounting')
  if (!state) return null
  if (state.status === 'error') {
    return (
      <p className="text-xs text-destructive mt-1.5 leading-relaxed">
        {humanizeError(state.error)}
      </p>
    )
  }
  const archiving = state.bronzeStatus === 'uploading'
  const showBar =
    state.status === 'uploading' ||
    state.status === 'processing' ||
    archiving
  if (!showBar && state.bronzeStatus !== 'error' && state.bronzeStatus !== 'skipped') return null

  let label = state.detail ?? ''
  if (state.bronzeStatus === 'error' || state.bronzeStatus === 'skipped') {
    label = ''
  } else if (state.phase === 'reading') {
    label = interpolate(t('ingestReading'), {
      read: formatBytes(state.bytesRead ?? 0),
      total: formatBytes(state.bytesTotal ?? 0),
    })
  } else if (state.phase === 'decoding') {
    label = t('ingestDecoding')
  } else if (state.phase === 'tokenizing') {
    label = t('ingestTokenizing')
  } else if (state.phase === 'parsing') {
    label = interpolate(t('ingestParsing'), {
      current: formatInteger(state.processedRows ?? 0),
      total: formatInteger(state.totalRows ?? 0),
      percent: state.progress,
    })
  } else if (archiving) {
    label = t('ingestArchiving')
  }

  return (
    <div className="mt-1.5 space-y-0.5">
      {showBar && (
        <Progress value={archiving ? 100 : state.progress} className="h-1.5" />
      )}
      {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
      {(state.bronzeStatus === 'error' || state.bronzeStatus === 'skipped') && state.bronzeError ? (
        <div className="space-y-0.5">
          <p className="text-xs text-amber-400 leading-relaxed">{state.bronzeError}</p>
          {state.operationId ? (
            <p className="text-xs text-muted-foreground">
              {interpolate(t('ingestOperationId'), { id: state.operationId })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-[11px] text-muted-foreground leading-none">
      <span className="font-mono font-semibold text-foreground/80">{value}</span>
      {label}
    </span>
  )
}

// ── Source badge config ───────────────────────────────────────────────────────

const SOURCE_BADGE_CONFIG: Record<'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch', { label: string; className: string }> = {
  believe:   { label: 'Believe',   className: 'bg-primary/15 text-primary' },
  bandcamp:  { label: 'Bandcamp',  className: 'bg-cyan-400/15 text-cyan-400' },
  shopify:   { label: 'Shopify',   className: 'bg-green-500/15 text-green-400' },
  printful:  { label: 'Printful',  className: 'bg-purple-500/15 text-purple-400' },
  darkmerch: { label: 'Darkmerch', className: 'bg-orange-500/15 text-orange-400' },
}

function SourceBadge({ source }: { source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch' }) {
  const { label, className } = SOURCE_BADGE_CONFIG[source]
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${className}`}>
      {label}
    </span>
  )
}

// ── Unknown CSV: profile selection dialog ──────────────────────────────────────

interface ProfileSelectionDialogProps {
  open: boolean
  fileName: string
  headers: string[]
  sampleRows: string[][]
  delimiter: ',' | ';' | '\t'
  profiles: CsvImportProfile[]
  onSaveAndImport: (profile: CsvImportProfile) => Promise<void>
  isRepair?: boolean
  repairSource?: 'believe' | 'bandcamp'
  onCancel: () => void
}

function ProfileSelectionDialog({
  open,
  fileName,
  headers,
  sampleRows,
  delimiter,
  profiles,
  onSaveAndImport,
  isRepair = false,
  repairSource,
  onCancel,
}: ProfileSelectionDialogProps) {
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [artist, setArtist] = useState('')
  const [revenue, setRevenue] = useState('')
  const [date, setDate] = useState('')
  const [mode, setMode] = useState<'profile' | 'manual'>('profile')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiQuestion, setAiQuestion] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [profileName, setProfileName] = useState('')
  const [updateId, setUpdateId] = useState('')
  const [aiError, setAiError] = useState('')
  const [extraMappings, setExtraMappings] = useState<Partial<Record<FinancialFieldKey, string>>>({})
  const [dateSemantics, setDateSemantics] = useState<ImportDateSemantics>('sale-date')
  const [dateOrder, setDateOrder] = useState<ImportDateOrder>('day-first')
  const [parserSource, setParserSource] = useState<'believe' | 'bandcamp'>(repairSource ?? 'believe')
  const [savingProfile, setSavingProfile] = useState(false)
  const tImport = useTranslations('admin.accounting')

  // This request is only possible in the unknown-format dialog. The main
  // importer never calls AI for recognized or previously confirmed profiles.
  const requestAi = async (answer?: string) => {
    setAiBusy(true)
    setAiError('')
    try {
      const response = await fetch('/api/admin/sos/import-profile-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          sample_rows: sanitizeAiSample({ headers, sampleRows, delimiter }).sampleRows,
          delimiter,
          ...(answer ? { user_answer: answer } : {}),
        }),
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        const error = body as { detail?: string }
        throw new Error(error.detail || tImport('aiImportFailed'))
      }
      const suggestion = body as {
        profile_name?: string
        field_mapping?: Record<string, string>
        question?: string | null
        explanation?: string
        parser_source?: ImportParserSource | null
        date_semantics?: ImportDateSemantics | null
        date_order?: ImportDateOrder | null
      }
      const mapping = suggestion.field_mapping ?? {}
      if (mapping.artist_name && headers.includes(mapping.artist_name)) setArtist(mapping.artist_name)
      if (mapping.net_revenue && headers.includes(mapping.net_revenue)) setRevenue(mapping.net_revenue)
      if (mapping.sales_month && headers.includes(mapping.sales_month)) setDate(mapping.sales_month)
      const extras: Partial<Record<FinancialFieldKey, string>> = {}
      for (const [key, value] of Object.entries(mapping)) {
        const field = AI_FIELD_TO_PROFILE[key]
        if (field && !['artistName', 'netRevenue', 'salesMonth'].includes(field) && headers.includes(value)) {
          extras[field] = value
        }
      }
      setExtraMappings(extras)
      if (suggestion.date_semantics) setDateSemantics(suggestion.date_semantics)
      if (suggestion.date_order) setDateOrder(suggestion.date_order)
      if (suggestion.parser_source === 'believe' || suggestion.parser_source === 'bandcamp') {
        if (!isRepair) setParserSource(suggestion.parser_source)
      }
      if (suggestion.profile_name) setProfileName(suggestion.profile_name)
      setAiQuestion(suggestion.question ?? null)
      setAiExplanation(suggestion.explanation ?? '')
      setMode('manual')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : tImport('aiImportFailed'))
    } finally {
      setAiBusy(false)
    }
  }

  const applyExistingProfile = (profile: CsvImportProfile) => {
    const mapping = profile.columnMapping
    setArtist(mapping.artistName && headers.includes(mapping.artistName) ? mapping.artistName : '')
    setRevenue(mapping.netRevenue && headers.includes(mapping.netRevenue) ? mapping.netRevenue : '')
    setDate(mapping.salesMonth && headers.includes(mapping.salesMonth) ? mapping.salesMonth : '')
    setExtraMappings(Object.fromEntries(
      OPTIONAL_FIELDS.map(({ field }) => [field, mapping[field] && headers.includes(mapping[field]) ? mapping[field] : undefined]),
    ) as Partial<Record<FinancialFieldKey, string>>)
    setProfileName(profile.name)
    setUpdateId(profile.isSystemDefault ? '' : profile.id)
    if (!repairSource && (profile.parserSource === 'believe' || profile.parserSource === 'bandcamp')) {
      setParserSource(profile.parserSource)
    }
    setDateSemantics(profile.dateSemantics ?? 'sale-date')
    setDateOrder(profile.dateOrder ?? 'day-first')
    setMode('manual')
  }

  const saveConfirmedProfile = async () => {
    if (!artist || !revenue || (dateSemantics !== 'none' && !date) || !profileName.trim() || savingProfile) return
    const existing = profiles.find((p) => p.id === updateId && !p.isSystemDefault)
    const profile: CsvImportProfile = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      name: profileName.trim(),
      type: 'financial',
      parserSource: repairSource ?? parserSource,
      dateSemantics,
      dateOrder,
      delimiter,
      autoDetectHeaders: headers.slice(0, 12),
      headerFingerprint: fingerprintHeaders(headers),
      columnMapping: {
        ...extraMappings,
        artistName: artist,
        netRevenue: revenue,
        ...(dateSemantics === 'none' ? {} : { salesMonth: date }),
      },
    }
    setSavingProfile(true)
    setAiError('')
    try {
      await onSaveAndImport(profile)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : tImport('aiImportFailed'))
    } finally {
      setSavingProfile(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (isRepair) {
      setMode('manual')
      if (repairSource) setParserSource(repairSource)
    }
    if (sampleRows.some((row) => row.some((cell) => /\bQ[1-4]\s*(?:[-–—]\s*Q[1-4])?\s+20\d{2}/i.test(cell)))) {
      setDateSemantics('report-period')
    }
    const suggestions = suggestColumnMappings(headers)
    if (suggestions.artistName) setArtist(suggestions.artistName)
    if (suggestions.netRevenue) setRevenue(suggestions.netRevenue)
    if (suggestions.salesMonth) setDate(suggestions.salesMonth)
  }, [open, headers, isRepair, repairSource, sampleRows])

  const financialProfiles = profiles.filter(p => p.type === 'financial')
  const canConfirmProfile = selectedProfileId !== ''
  const canConfirmManual = artist && revenue && (dateSemantics === 'none' || date)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info size={20} className="text-amber-400" />
            {tImport('aiImportUnknownTitle')}
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{fileName}</strong> doesn&apos;t match a known format.
            {tImport('aiImportUnknownDescription')}
          </DialogDescription>
        </DialogHeader>

        {!isRepair && <div className="flex gap-2 mb-3">
          <Button
            size="sm"
            variant={mode === 'profile' ? 'default' : 'outline'}
            onClick={() => setMode('profile')}
            className="flex-1 text-xs"
          >
            {tImport('aiImportSelectProfile')}
          </Button>
          <Button
            size="sm"
            variant={mode === 'manual' ? 'default' : 'outline'}
            onClick={() => setMode('manual')}
            className="flex-1 text-xs"
          >
            {tImport('aiImportMapManually')}
          </Button>
        </div>}

        <div className="rounded-md border border-border p-3 space-y-2">
          <Button type="button" size="sm" variant="outline" disabled={aiBusy}
            onClick={() => { void requestAi() }}>
            {aiBusy ? tImport('aiImportAnalyzing') : tImport('aiImportAnalyze')}
          </Button>
          <p className="text-xs text-muted-foreground">{tImport('aiImportSampleOnly')}</p>
          {aiError && <p role="alert" className="text-xs text-destructive">{aiError}</p>}
          {aiExplanation && <p className="text-xs">{aiExplanation}</p>}
          {aiQuestion && <div className="space-y-2">
            <Label>{aiQuestion}</Label>
            <Input value={aiAnswer} onChange={(event) => setAiAnswer(event.target.value)}
              maxLength={350} placeholder={tImport('aiImportAnswerPlaceholder')} />
            <Button type="button" size="sm" disabled={aiBusy || !aiAnswer.trim()}
              onClick={() => { void requestAi(aiAnswer.trim()) }}>{tImport('aiImportAnswer')}</Button>
          </div>}
        </div>

        {mode === 'profile' && (
          <div className="space-y-3 py-2">
            <Label className="text-xs font-medium">{tImport('aiImportProfile')}</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue placeholder={tImport('aiImportChooseProfile')} />
              </SelectTrigger>
              <SelectContent>
                {financialProfiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.isSystemDefault && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(System)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tImport('aiImportProfileHelp')}
            </p>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tImport('aiImportArtistColumn')}</Label>
              <Select value={artist} onValueChange={setArtist}>
                <SelectTrigger><SelectValue placeholder={tImport('aiImportSelectColumn')} /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tImport('aiImportRevenueColumn')}</Label>
              <Select value={revenue} onValueChange={setRevenue}>
                <SelectTrigger><SelectValue placeholder={tImport('aiImportSelectColumn')} /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tImport('aiImportDateColumn')}</Label>
              <Select value={date} onValueChange={setDate} disabled={dateSemantics === 'none'}>
                <SelectTrigger><SelectValue placeholder={tImport('aiImportSelectColumn')} /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{tImport('aiImportSource')}</Label>
              <Select value={parserSource} onValueChange={(value) => setParserSource(value as 'believe' | 'bandcamp')} disabled={Boolean(repairSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="believe">{tImport('aiImportStandardSource')}</SelectItem>
                  <SelectItem value="bandcamp">Bandcamp</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{tImport('aiImportSpecializedHelp')}</p>
            </div>
            <div className="space-y-2">
              <Label>{tImport('aiImportDateSemantics')}</Label>
              <Select value={dateSemantics} onValueChange={(value) => setDateSemantics(value as ImportDateSemantics)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale-date">{tImport('aiImportSaleDate')}</SelectItem>
                  <SelectItem value="report-period">{tImport('aiImportReportPeriod')}</SelectItem>
                  <SelectItem value="none">{tImport('aiImportNoDate')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateSemantics === 'sale-date' && <div className="space-y-2">
              <Label>{tImport('aiImportDateFormat')}</Label>
              <Select value={dateOrder} onValueChange={(value) => setDateOrder(value as ImportDateOrder)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day-first">DD/MM/YYYY</SelectItem>
                  <SelectItem value="month-first">MM/DD/YYYY</SelectItem>
                  <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>}
            <details className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-sm">{tImport('aiImportOptionalFields')}</summary>
              <div className="grid gap-2 pt-3">
                {OPTIONAL_FIELDS.map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <Label>{label}</Label>
                    <Select value={extraMappings[field] ?? '__none__'} onValueChange={(value) =>
                      setExtraMappings((prev) => ({ ...prev, [field]: value === '__none__' ? undefined : value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{tImport('aiImportNotMapped')}</SelectItem>
                        {headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </details>
          <div className="space-y-2">
            <Label>{tImport('aiImportProfileName')}</Label>
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)}
              maxLength={80} placeholder={tImport('aiImportProfileNamePlaceholder')} />
            {profiles.some((p) => !p.isSystemDefault) && (
              <Select value={updateId} onValueChange={(id) => {
                setUpdateId(id)
                const selected = profiles.find((profile) => profile.id === id)
                if (selected) setProfileName(selected.name)
              }}>
                <SelectTrigger><SelectValue placeholder={tImport('aiImportUpdateExisting')} /></SelectTrigger>
                <SelectContent>
                  {profiles.filter((p) => !p.isSystemDefault).map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} size="sm">{tImport('aiImportCancel')}</Button>
          {mode === 'profile' ? (
            <Button
              onClick={() => {
                const profile = financialProfiles.find(p => p.id === selectedProfileId)
                if (profile) applyExistingProfile(profile)
              }}
              disabled={!canConfirmProfile}
              size="sm"
            >
              {tImport('aiImportReviewProfile')}
            </Button>
          ) : (
            <>
              <Button onClick={() => { void saveConfirmedProfile() }} disabled={!canConfirmManual || !profileName.trim() || savingProfile}
                size="sm">{tImport('aiImportSaveProfile')}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Combined file list item ───────────────────────────────────────────────────

interface FileItemProps {
  file: UploadedFile
  source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'
  state: FileProcessingState | undefined
  index: number
  onRemove: () => void
  onReplace: (() => void) | null
  replaceRef: ((el: HTMLInputElement | null) => void) | null
  onReplaceInput: ((e: React.ChangeEvent<HTMLInputElement>) => void) | null
  onRetryArchive: (() => void) | null
  onRepair: (() => void) | null
  onRestore: (() => void) | null
}

function FileItem({ file, source, state, index, onRemove, onReplace, replaceRef, onReplaceInput, onRetryArchive, onRepair, onRestore }: FileItemProps) {
  const t = useTranslations('admin.accounting')
  const isProcessingFile =
    state?.status === 'uploading' ||
    state?.status === 'processing' ||
    state?.bronzeStatus === 'uploading'
  const isDone = !state || state.status === 'done' || state.status === 'idle'
  const hasData = Boolean(file.data)
  const needsRestore = !hasData && Boolean(file.bronzeBatchId) && !isProcessingFile
  const needsReupload = isDone && !hasData
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
      transition={prefersReducedMotion ? { duration: 0 } : { delay: index * 0.04 }}
    >
      {replaceRef && (
        <input
          type="file"
          accept=".csv"
          className="hidden"
          ref={replaceRef}
          onChange={onReplaceInput ?? undefined}
        />
      )}

      <Card
        className={[
          'p-3 transition-shadow',
          state?.status === 'error'
            ? 'border-destructive/40 bg-destructive/5'
            : needsReupload
              ? needsRestore ? 'border-border bg-card/40' : 'border-amber-500/30 bg-amber-500/5'
              : 'bg-card hover:shadow-md',
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded flex-shrink-0 mt-0.5">
            <FileCsv size={20} weight="fill" className="text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileStatusIcon state={state} hasData={hasData} archived={Boolean(file.bronzeBatchId)} />
              <p className="text-sm font-medium truncate">{file.name}</p>
              <SourceBadge source={source} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>

            {isDone && (file.rowsParsed != null || file.rowsSkipped != null) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {file.rowsParsed != null && <StatPill label="rows" value={formatInteger(file.rowsParsed)} />}
                {file.uniqueArtistsCount != null && file.uniqueArtistsCount > 0 && (
                  <StatPill label="artists" value={formatInteger(file.uniqueArtistsCount)} />
                )}
                {file.rowsSkipped != null && file.rowsSkipped > 0 && (
                  <StatPill label="skipped" value={formatInteger(file.rowsSkipped)} />
                )}
                {file.bronzeBatchId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    <CloudArrowUp size={11} weight="bold" />
                    R2 archived
                  </span>
                )}
                {state?.bronzeStatus === 'uploading' && !file.bronzeBatchId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    <Spinner size={11} className="animate-spin" />
                    Archiving…
                  </span>
                )}
                {state?.bronzeStatus === 'error' && !file.bronzeBatchId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                    R2 archive failed
                  </span>
                )}
                {state?.bronzeStatus === 'skipped' && !file.bronzeBatchId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                    R2 archive skipped
                  </span>
                )}
              </div>
            )}

            {needsReupload && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className={file.bronzeBatchId ? "text-xs text-muted-foreground" : "text-xs text-amber-400"}>
                  {file.bronzeBatchId
                    ? 'Saved in archive. Restore the data to continue.'
                    : 'The original file data is no longer loaded. Select the file again.'}
                </p>
                {file.bronzeBatchId && onRestore && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRestore}
                    disabled={!needsRestore}
                    className="h-8 gap-1.5"
                  >
                    <CloudArrowDown size={15} />
                    Restore data
                  </Button>
                )}
              </div>
            )}
            {!isProcessingFile && !hasData && !isDone && file.bronzeBatchId && onRestore && (
              <Button type="button" size="sm" variant="outline" onClick={onRestore} className="mt-2 h-8 gap-1.5">
                <CloudArrowDown size={15} />
                Retry restore
              </Button>
            )}

            <FileProgressBar state={state} />
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {onRepair && state?.status === 'error' && (
              <Button type="button" variant="outline" size="sm" onClick={onRepair}
                title={t('aiImportRepair')}>{t('aiImportRepair')}</Button>
            )}
            {onRetryArchive && (state?.bronzeStatus === 'error' || state?.bronzeStatus === 'skipped') && !file.bronzeBatchId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetryArchive}
                disabled={isProcessingFile}
                title={t('ingestArchiveRetry')}
                className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
              >
                <CloudArrowUp size={15} />
              </Button>
            )}
            {onReplace && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReplace}
                disabled={isProcessingFile}
                title="Replace file"
                className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
              >
                <ArrowsClockwise size={15} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={isProcessingFile}
              title="Remove file"
              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            >
              <X size={15} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ── File entry type (for combined file list) ─────────────────────────────────

interface FileEntry {
  file: UploadedFile
  source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'
  state: FileProcessingState | undefined
  onRemove: () => void
  onReplace: (() => void) | null
  replaceRef: ((el: HTMLInputElement | null) => void) | null
  onReplaceInput: ((e: React.ChangeEvent<HTMLInputElement>) => void) | null
  onRetryArchive: (() => void) | null
  onRepair: (() => void) | null
  onRestore: (() => void) | null
}

// ── Main component ────────────────────────────────────────────────────────────

export function UniversalFileUploadZone({
  believeManager,
  bandcampManager,
  shopifyManager,
  printfulManager,
  darkmerchManager,
  onSaveProfile,
  csvProfiles = [],
  isProcessing = false,
  pipelineProgress = null,
}: UniversalFileUploadZoneProps) {
  const tToast = useTranslations('admin.toast')
  const t = useTranslations('admin.accounting')


  const [isDragging, setIsDragging] = useState(false)
  const [sizeWarning, setSizeWarning] = useState<string | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()

  // Pending file awaiting format mapping from the user
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingHeaders, setPendingHeaders] = useState<string[]>([])
  const [pendingSample, setPendingSample] = useState<ImportSample | null>(null)
  const [repairFileId, setRepairFileId] = useState<string | null>(null)
  const [repairSource, setRepairSource] = useState<'believe' | 'bandcamp' | undefined>()
  const pendingQueueRef = useRef<Array<{ file: File; headers: string[]; sample: ImportSample }>>([])
  const pendingActiveRef = useRef(false)

  const showPending = useCallback((job: { file: File; headers: string[]; sample: ImportSample }) => {
    pendingActiveRef.current = true
    setPendingFile(job.file)
    setPendingHeaders(job.headers)
    setPendingSample(job.sample)
  }, [])
  const enqueuePending = useCallback((job: { file: File; headers: string[]; sample: ImportSample }) => {
    if (pendingActiveRef.current) pendingQueueRef.current.push(job)
    else showPending(job)
  }, [showPending])
  const finishPending = useCallback(() => {
    setRepairFileId(null)
    setRepairSource(undefined)
    const next = pendingQueueRef.current.shift()
    if (next) showPending(next)
    else {
      pendingActiveRef.current = false
      setPendingFile(null)
      setPendingHeaders([])
      setPendingSample(null)
    }
  }, [showPending])


  // Per-file replace input refs (keyed by file id)
  const replaceRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const makeRefSetter = useCallback(
    (id: string) => (el: HTMLInputElement | null) => {
      if (el) replaceRefs.current.set(id, el)
      else replaceRefs.current.delete(id)
    },
    []
  )

  const isAnyProcessing =
    isProcessing ||
    Object.values(believeManager.fileStates).some(
      (s) => s.status === 'uploading' || s.status === 'processing' || s.bronzeStatus === 'uploading',
    ) ||
    Object.values(bandcampManager.fileStates).some(
      (s) => s.status === 'uploading' || s.status === 'processing' || s.bronzeStatus === 'uploading',
    )

  // ── File routing ──────────────────────────────────────────────────────────

  const routeFile = useCallback(async (file: File) => {
    // XLSX files are always routed to Darkmerch — no header inspection needed.
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      toast.info(`"${file.name}" detected as Darkmerch XLSX`, { duration: 3000 })
      darkmerchManager.addFiles([file])
      return
    }

    const { source, headers, matchedProfile, sample } = await detectCSVSource(file, csvProfiles)

    if (source === 'believe') {
      toast.info(`"${file.name}" detected as Believe CSV`, { duration: 3000 })
      believeManager.addFiles([file])
    } else if (source === 'bandcamp') {
      const label = matchedProfile ? `"${matchedProfile.name}" profile` : 'Bandcamp CSV'
      toast.info(`"${file.name}" detected as ${label}`, { duration: 3000 })
      bandcampManager.addFiles([file])
    } else if (source === 'profile-financial') {
      // Generic financial profile — route to believe manager (streaming parser)
      const label = matchedProfile?.name ?? 'custom profile'
      toast.info(`"${file.name}" matched profile "${label}"`, { duration: 3000 })
      believeManager.addFiles([file])
    } else if (source === 'shopify') {
      toast.info(`"${file.name}" detected as Shopify export`, { duration: 3000 })
      shopifyManager.addFiles([file])
    } else if (source === 'printful') {
      toast.info(`"${file.name}" detected as Printful export`, { duration: 3000 })
      printfulManager.addFiles([file])
    } else if (source === 'darkmerch') {
      toast.info(`"${file.name}" detected as Darkmerch export`, { duration: 3000 })
      darkmerchManager.addFiles([file])
    } else {
      // Unknown format: open profile selection / mapping dialog
      setPendingFile(file)
      setPendingHeaders(headers)
      setPendingSample(sample)
    }
  }, [believeManager, bandcampManager, shopifyManager, printfulManager, darkmerchManager, csvProfiles])

  const processFiles = useCallback(async (rawFiles: File[]) => {
    const acceptedFiles = rawFiles.filter(f => {
      const lower = f.name.toLowerCase()
      return lower.endsWith('.csv') || lower.endsWith('.xlsx')
    })
    const rejected = rawFiles.length - acceptedFiles.length

    if (rejected > 0) {
      const msg = `${rejected} file${rejected !== 1 ? 's' : ''} rejected — only CSV and XLSX files are accepted.`
      setTypeError(msg)
      toast.error(tToast('invalid_file_type'), { description: msg })
      setTimeout(() => setTypeError(null), 6000)
    }

    const LARGE_THRESHOLD = 50 * 1024 * 1024
    const large = acceptedFiles.find(f => f.size > LARGE_THRESHOLD)
    if (large) {
      const msg = interpolate(t('largeFileWarning'), {
        filename: large.name,
        size: formatFileSize(large.size),
      })
      setSizeWarning(msg)
      setTimeout(() => setSizeWarning(null), 8000)
    }

    for (const file of acceptedFiles) {
      await routeFile(file)
    }
  }, [routeFile, tToast, t])

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    processFiles(Array.from(e.target.files))
    e.target.value = ''
  }, [processFiles])

  // ── Replace handlers ───────────────────────────────────────────────────────

  const handleReplaceInput = useCallback(
    (manager: FileManagerCallbacks, id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) manager.replaceFile(id, file)
      e.target.value = ''
    },
    []
  )

  // ── Unknown CSV mapping dialog ─────────────────────────────────────────────

  const handleSaveAndImport = useCallback(async (profile: CsvImportProfile): Promise<void> => {
    if (!pendingFile) return
    const source = profile.parserSource ?? 'believe'
    if (repairFileId && repairSource && source !== repairSource) {
      throw new Error('A repair cannot change the source parser. Re-import the file if the source type is different.')
    }
    if (source !== 'believe' && source !== 'bandcamp') {
      throw new Error('This custom mapping requires the complete supplier schema. Select Standard or Bandcamp.')
    }
    const uploadFile = pendingFile.name.toLowerCase().endsWith('.xlsx') && !repairFileId
      ? await readXlsxAsCsv(pendingFile)
      : pendingFile
    // Only a confirmed server write can trigger a financial import.
    await onSaveProfile(profile)
    if (repairFileId) {
      const manager = repairSource === 'bandcamp' ? bandcampManager : believeManager
      manager.prepareProfileRepair?.(repairFileId)
    } else {
      const manager = source === 'bandcamp' ? bandcampManager : believeManager
      await manager.addFiles([uploadFile])
    }
    toast.success(t('aiImportProfileSaved'))
    finishPending()
  }, [pendingFile, repairFileId, repairSource, onSaveProfile, believeManager, bandcampManager, finishPending, t])

  const openRepair = useCallback((file: UploadedFile) => {
    if (!file.data || pendingActiveRef.current) return
    try {
      const preview = parseImportSample(file.data.slice(0, 256 * 1024))
      pendingActiveRef.current = true
      setPendingFile(new File([], file.name))
      setPendingHeaders(preview.headers)
      setPendingSample(preview)
      setRepairFileId(file.id)
      setRepairSource(file.type === 'bandcamp' ? 'bandcamp' : 'believe')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('aiImportFailed'))
    }
  }, [t])

  const handleMappingCancel = useCallback(() => {
    toast.info(tToast('import_cancelled'))
    finishPending()
  }, [tToast, finishPending])

  // ── Combined file list (all sources) ─────────────────────────────────────

  /** Builds FileEntry objects for a streaming-parser manager (believe/bandcamp). */
  const makeStreamingEntries = useCallback(
    (manager: FileManagerCallbacks, source: 'believe' | 'bandcamp'): FileEntry[] =>
      manager.files.map(f => ({
        file: f,
        source,
        state: manager.fileStates[f.id],
        onRemove: () => manager.removeFile(f.id),
        onReplace: () => replaceRefs.current.get(f.id)?.click(),
        replaceRef: makeRefSetter(f.id),
        onReplaceInput: (e: React.ChangeEvent<HTMLInputElement>) => handleReplaceInput(manager, f.id, e),
        onRetryArchive: manager.retryArchive ? () => manager.retryArchive?.(f.id) : null,
        onRepair: f.data && (
          manager.fileStates[f.id]?.status === 'error' ||
          manager.fileStates[f.id]?.bronzeStatus === 'skipped' ||
          manager.fileStates[f.id]?.bronzeStatus === 'error' ||
          (f.rowsSkipped ?? 0) > 0
        ) ? () => openRepair(f) : null,
        onRestore: manager.restoreArchivedFile
          ? () => { void manager.restoreArchivedFile!(f.id).catch((err) => {
              toast.error(t('bronzeArchiveLoadError'), {
                description: err instanceof Error ? err.message : String(err),
              })
            }) }
          : null,
      })),
    [makeRefSetter, handleReplaceInput, openRepair]
  )

  /** Builds FileEntry objects for an e-commerce manager (shopify/printful/darkmerch). */
  const makeEcommerceEntries = useCallback(
    (manager: EcommerceManagerCallbacks, source: 'shopify' | 'printful' | 'darkmerch'): FileEntry[] =>
      manager.files.map(f => ({
        file: f,
        source,
        state: manager.fileStates?.[f.id],
        onRemove: () => manager.removeFile(f.id),
        onReplace: null,
        replaceRef: null,
        onReplaceInput: null,
        onRetryArchive: manager.retryArchive ? () => manager.retryArchive?.(f.id) : null,
        onRepair: null,
        onRestore: manager.restoreArchivedFile
          ? () => { void manager.restoreArchivedFile!(f.id).catch((err) => {
              toast.error(t('bronzeArchiveLoadError'), {
                description: err instanceof Error ? err.message : String(err),
              })
            }) }
          : null,
      })),
    []
  )

  const allFiles: FileEntry[] = [
    ...makeStreamingEntries(believeManager, 'believe'),
    ...makeStreamingEntries(bandcampManager, 'bandcamp'),
    ...makeEcommerceEntries(shopifyManager, 'shopify'),
    ...makeEcommerceEntries(printfulManager, 'printful'),
    ...makeEcommerceEntries(darkmerchManager, 'darkmerch'),
  ].sort((a, b) => new Date(a.file.uploadedAt).getTime() - new Date(b.file.uploadedAt).getTime())

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative rounded-lg border-2 border-dashed px-4 py-5 transition-all duration-200 sm:px-6 sm:py-6',
          isDragging
            ? 'border-accent bg-accent/5 shadow-lg shadow-accent/20'
            : 'border-border hover:border-accent/50 hover:bg-accent/5',
        ].join(' ')}
      >
        <input
          type="file"
          accept=".csv,.xlsx"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          id="universal-file-input"
        />

        <div className="pointer-events-none flex flex-col items-center gap-2">
          <div
            className={[
              'rounded-full p-3 transition-colors',
              isDragging ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary',
            ].join(' ')}
          >
            {isAnyProcessing ? (
              <Spinner size={26} weight="bold" className="animate-spin" />
            ) : (
              <UploadSimple size={26} weight="bold" />
            )}
          </div>

          <div className="text-center">
            <p className="text-base font-semibold mb-1">
              {isAnyProcessing ? t('ingestPipelineTitle') : 'Upload CSV / XLSX files'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isAnyProcessing
                ? pipelineProgress
                  ? interpolate(
                      pipelineProgress.phase === 'aggregating'
                        ? t('ingestAggregating')
                        : pipelineProgress.phase === 'summaries'
                          ? t('ingestSummaries')
                          : t('ingestFinalizing'),
                      { percent: pipelineProgress.percentage },
                    )
                  : t('ingestWaitingParser')
                : 'Drag & drop files here or click to browse — format is auto-detected'}
            </p>
          </div>

          {!isAnyProcessing && (
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge variant="secondary" className="text-xs">Believe</Badge>
              <Badge variant="secondary" className="text-xs">Bandcamp</Badge>
              <Badge variant="secondary" className="text-xs">Shopify</Badge>
              <Badge variant="secondary" className="text-xs">Printful</Badge>
              <Badge variant="secondary" className="text-xs">Darkmerch</Badge>
              <Badge variant="outline" className="text-xs">Multiple files</Badge>
            </div>
          )}
        </div>
      </div>

      {/* Warnings */}
      <AnimatePresence>
        {sizeWarning && (
          <motion.div
            initial={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs"
          >
            <Warning size={14} className="shrink-0 mt-0.5" />
            <span>{sizeWarning}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {typeError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs"
          >
            <WarningCircle size={14} className="shrink-0 mt-0.5" />
            <span>{typeError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {allFiles.length > 0 && (isAnyProcessing || pipelineProgress) && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{t('ingestPipelineTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {interpolate(t('ingestPipelineFiles'), {
                done: allFiles.filter((entry) => entry.state?.status === 'done').length,
                total: allFiles.length,
              })}
            </p>
          </div>
          <Progress
            value={
              pipelineProgress?.percentage ??
              Math.round(
                allFiles.reduce((sum, entry) => sum + (entry.state?.progress ?? 0), 0) /
                  Math.max(1, allFiles.length),
              )
            }
            className="h-1.5"
          />
        </div>
      )}

      {/* Combined file list */}
      <AnimatePresence mode="popLayout">
        {allFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: prefersReducedMotion ? 'auto' : 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="space-y-2"
          >
            {allFiles.map(({ file, source, state, onRemove, onReplace, replaceRef, onReplaceInput, onRetryArchive, onRepair, onRestore }, index) => (
              <FileItem
                key={file.id}
                file={file}
                source={source}
                state={state}
                index={index}
                onRemove={onRemove}
                onReplace={onReplace}
                replaceRef={replaceRef}
                onReplaceInput={onReplaceInput}
                onRetryArchive={onRetryArchive}
                onRepair={onRepair}
                onRestore={onRestore}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unknown CSV dialog — profile selection or manual mapping */}
      {pendingFile && pendingSample && (
        <ProfileSelectionDialog
          open={true}
          fileName={pendingFile.name}
          headers={pendingHeaders}
          sampleRows={pendingSample.sampleRows}
          delimiter={pendingSample.delimiter}
          profiles={csvProfiles}
          onSaveAndImport={handleSaveAndImport}
          isRepair={repairFileId !== null}
          repairSource={repairSource}
          onCancel={handleMappingCancel}
        />
      )}
    </div>
  )
}
