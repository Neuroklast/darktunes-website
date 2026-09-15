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
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import type { UploadedFile, FileProcessingState } from '@/lib/sos/types'
import { formatBytes, formatInteger, type SosProcessProgress } from '@/lib/sos/ingestProgress'
import { interpolate } from '@/lib/i18n/interpolate'
import { parseCSVLine } from '@/lib/sos/ingest/csv-parser'
import { matchProfile } from '@/lib/sos/ingest/parser-facade'
import {
  SYSTEM_SHOPIFY_PROFILE_ID,
  SYSTEM_PRINTFUL_PROFILE_ID,
  SYSTEM_BANDCAMP_PROFILE_ID,
  SYSTEM_BANDCAMP_DDS_PROFILE_ID,
  SYSTEM_DARKMERCH_PROFILE_ID,
} from '@/lib/sos/ingest/default-profiles'
import { suggestColumnMappings } from '@/lib/sos/ingest/columnMappingSuggestions'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileManagerCallbacks {
  files: UploadedFile[]
  fileStates: Record<string, FileProcessingState>
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  replaceFile: (id: string, file: File) => void
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
  /** Called when an unknown CSV is confirmed with user-defined column aliases. */
  onAddAliases: (aliases: { fieldName: string; synonym: string }[]) => void
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
  matchedProfile?: CsvImportProfile
}> {
  const buffer = await file.arrayBuffer()
  const firstBytes = new Uint8Array(buffer, 0, 2)
  let text: string
  if (firstBytes[0] === 0xFF && firstBytes[1] === 0xFE) {
    text = new TextDecoder('utf-16le').decode(buffer)
  } else if (firstBytes[0] === 0xFE && firstBytes[1] === 0xFF) {
    text = new TextDecoder('utf-16be').decode(buffer)
  } else {
    text = new TextDecoder('utf-8').decode(buffer)
  }

  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text
  const firstLine = clean.split(/\r?\n/)[0] ?? ''
  const delimiter = firstLine.includes(';') ? ';' : ','
  const rawHeaders = parseCSVLine(firstLine, delimiter).map(h => h.trim())
  const normalizedHeaders = rawHeaders.map(h => h.toLowerCase())

  // ── Phase 1: Profile-based matching (financial only) ─────────────────────
  if (profiles.length > 0) {
    const financialProfiles = profiles.filter((p) => p.type !== 'master-data')
    const matched = matchProfile(rawHeaders, financialProfiles)
    if (matched) {
      if (matched.id === SYSTEM_SHOPIFY_PROFILE_ID) {
        return { source: 'shopify', headers: rawHeaders, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_PRINTFUL_PROFILE_ID) {
        return { source: 'printful', headers: rawHeaders, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_BANDCAMP_PROFILE_ID || matched.id === SYSTEM_BANDCAMP_DDS_PROFILE_ID) {
        return { source: 'bandcamp', headers: rawHeaders, matchedProfile: matched }
      }
      if (matched.id === SYSTEM_DARKMERCH_PROFILE_ID) {
        return { source: 'darkmerch', headers: rawHeaders, matchedProfile: matched }
      }
      // Any other financial profile routes to the generic believe parser
      return { source: 'profile-financial', headers: rawHeaders, matchedProfile: matched }
    }
  }

  // ── Phase 2: Legacy hardcoded heuristics ─────────────────────────────────
  if (normalizedHeaders.some(h => h === 'bandcamp transaction id')) {
    return { source: 'bandcamp', headers: normalizedHeaders }
  }
  if (
    normalizedHeaders.some((h) => h.includes('sales month')) &&
    normalizedHeaders.some((h) => h === 'isrc')
  ) {
    return { source: 'believe', headers: normalizedHeaders }
  }
  // Darkmerch CSV: has BAND and NET REVENUE columns
  if (normalizedHeaders.some(h => h === 'band') && normalizedHeaders.some(h => h === 'net revenue')) {
    return { source: 'darkmerch', headers: rawHeaders }
  }
  // Artist roster CSVs are intentionally not auto-detected — roster comes from the portal DB.
  return { source: 'unknown', headers: rawHeaders }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FileStatusIcon({ state, hasData }: { state: FileProcessingState | undefined; hasData: boolean }) {
  if (state?.status === 'error') return <WarningCircle size={16} className="text-destructive flex-shrink-0" />
  if (state?.status === 'uploading' || state?.status === 'processing')
    return <Spinner size={16} className="text-primary animate-spin flex-shrink-0" />
  if (!hasData && !state) return <Warning size={16} className="text-amber-400 flex-shrink-0" />
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
  if (!showBar && state.bronzeStatus !== 'error') return null

  let label = state.detail ?? ''
  if (state.phase === 'reading') {
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
      {state.bronzeStatus === 'error' && state.bronzeError ? (
        <p className="text-xs text-amber-400 leading-relaxed">{state.bronzeError}</p>
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
  profiles: CsvImportProfile[]
  onSelectProfile: (profile: CsvImportProfile) => void
  onFallbackMapping: (mapping: { artist: string; revenue: string; date: string }) => void
  onCancel: () => void
}

function ProfileSelectionDialog({
  open,
  fileName,
  headers,
  profiles,
  onSelectProfile,
  onFallbackMapping,
  onCancel,
}: ProfileSelectionDialogProps) {
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [artist, setArtist] = useState('')
  const [revenue, setRevenue] = useState('')
  const [date, setDate] = useState('')
  const [mode, setMode] = useState<'profile' | 'manual'>('profile')

  useEffect(() => {
    if (!open) return
    const suggestions = suggestColumnMappings(headers)
    if (suggestions.artistName) setArtist(suggestions.artistName)
    if (suggestions.netRevenue) setRevenue(suggestions.netRevenue)
    if (suggestions.salesMonth) setDate(suggestions.salesMonth)
  }, [open, headers])

  const financialProfiles = profiles.filter(p => p.type === 'financial')
  const canConfirmProfile = selectedProfileId !== ''
  const canConfirmManual = artist && revenue && date

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info size={20} className="text-amber-400" />
            Unknown CSV Format
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{fileName}</strong> doesn&apos;t match a known format.
            Select a profile or map columns manually.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <Button
            size="sm"
            variant={mode === 'profile' ? 'default' : 'outline'}
            onClick={() => setMode('profile')}
            className="flex-1 text-xs"
          >
            Select Profile
          </Button>
          <Button
            size="sm"
            variant={mode === 'manual' ? 'default' : 'outline'}
            onClick={() => setMode('manual')}
            className="flex-1 text-xs"
          >
            Map Manually
          </Button>
        </div>

        {mode === 'profile' && (
          <div className="space-y-3 py-2">
            <Label className="text-xs font-medium">CSV Import Profile</Label>
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a profile…" />
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
              The profile&apos;s column mapping will be applied. Add profiles in Settings → CSV-Profile.
            </p>
          </div>
        )}

        {mode === 'manual' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Artist / Künstler column</Label>
              <Select value={artist} onValueChange={setArtist}>
                <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Revenue / Umsatz column</Label>
              <Select value={revenue} onValueChange={setRevenue}>
                <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Date / Datum column</Label>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger><SelectValue placeholder="Select column…" /></SelectTrigger>
                <SelectContent>
                  {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} size="sm">Cancel</Button>
          {mode === 'profile' ? (
            <Button
              onClick={() => {
                const profile = financialProfiles.find(p => p.id === selectedProfileId)
                if (profile) onSelectProfile(profile)
              }}
              disabled={!canConfirmProfile}
              size="sm"
            >
              Import with Profile
            </Button>
          ) : (
            <Button
              onClick={() => canConfirmManual && onFallbackMapping({ artist, revenue, date })}
              disabled={!canConfirmManual}
              size="sm"
            >
              Import File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Legacy Unknown CSV mapping dialog (kept for non-profile fallback) ──────────

interface MappingDialogProps {
  open: boolean
  headers: string[]
  fileName: string
  onConfirm: (mapping: { artist: string; revenue: string; date: string }) => void
  onCancel: () => void
}

function UnknownCSVMappingDialog({ open, headers, fileName, onConfirm, onCancel }: MappingDialogProps) {
  const [artist, setArtist] = useState('')
  const [revenue, setRevenue] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    if (!open) return
    const suggestions = suggestColumnMappings(headers)
    if (suggestions.artistName) setArtist(suggestions.artistName)
    if (suggestions.netRevenue) setRevenue(suggestions.netRevenue)
    if (suggestions.salesMonth) setDate(suggestions.salesMonth)
  }, [open, headers])

  const canConfirm = artist && revenue && date

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info size={20} className="text-amber-400" />
            Unknown CSV Format
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{fileName}</strong> doesn&apos;t match a known format.
            Please assign the correct columns below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Artist / Künstler column</Label>
            <Select value={artist} onValueChange={setArtist}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Revenue / Umsatz column</Label>
            <Select value={revenue} onValueChange={setRevenue}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date / Datum column</Label>
            <Select value={date} onValueChange={setDate}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} size="sm">Cancel</Button>
          <Button
            onClick={() => canConfirm && onConfirm({ artist, revenue, date })}
            disabled={!canConfirm}
            size="sm"
          >
            Import File
          </Button>
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
}

function FileItem({ file, source, state, index, onRemove, onReplace, replaceRef, onReplaceInput }: FileItemProps) {
  const isProcessingFile =
    state?.status === 'uploading' ||
    state?.status === 'processing' ||
    state?.bronzeStatus === 'uploading'
  const isDone = !state || state.status === 'done' || state.status === 'idle'
  const hasData = Boolean(file.data)
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
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'bg-card hover:shadow-md',
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded flex-shrink-0 mt-0.5">
            <FileCsv size={20} weight="fill" className="text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileStatusIcon state={state} hasData={hasData} />
              <p className="text-sm font-medium truncate">{file.name}</p>
              <SourceBadge source={source} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>

            {isDone && (file.rowsParsed != null || file.rowsSkipped != null) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {file.rowsParsed != null && <StatPill label="rows" value={formatCount(file.rowsParsed)} />}
                {file.uniqueArtistsCount != null && file.uniqueArtistsCount > 0 && (
                  <StatPill label="artists" value={formatCount(file.uniqueArtistsCount)} />
                )}
                {file.rowsSkipped != null && file.rowsSkipped > 0 && (
                  <StatPill label="skipped" value={formatCount(file.rowsSkipped)} />
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
              </div>
            )}

            {needsReupload && (
              <p className="text-xs text-amber-400 mt-1">Data not in memory — re-upload or load from Bronze archives below</p>
            )}

            <FileProgressBar state={state} />
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
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
}

// ── Main component ────────────────────────────────────────────────────────────

export function UniversalFileUploadZone({
  believeManager,
  bandcampManager,
  shopifyManager,
  printfulManager,
  darkmerchManager,
  onAddAliases,
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
  const [pendingHasProfiles, setPendingHasProfiles] = useState(false)

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

    const { source, headers, matchedProfile } = await detectCSVSource(file, csvProfiles)

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
      setPendingHasProfiles(csvProfiles.filter((p) => p.type === 'financial').length > 0)
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

  const handleProfileSelected = useCallback(
    (profile: CsvImportProfile) => {
      if (!pendingFile) return
      // Route based on matched profile (same logic as routeFile)
      const label = profile.name
      if (profile.id === SYSTEM_BANDCAMP_PROFILE_ID) {
        bandcampManager.addFiles([pendingFile])
      } else {
        believeManager.addFiles([pendingFile])
      }
      toast.success(`"${pendingFile.name}" imported with profile "${label}"`)
      setPendingFile(null)
      setPendingHeaders([])
    },
    [pendingFile, believeManager, bandcampManager]
  )

  const handleMappingConfirm = useCallback(
    (mapping: { artist: string; revenue: string; date: string }) => {
      if (!pendingFile) return

      // Add the user's column selections as global aliases so the parser can
      // auto-map them. These also persist to help future similar CSVs.
      onAddAliases([
        { fieldName: 'original_artist', synonym: mapping.artist },
        { fieldName: 'net_revenue', synonym: mapping.revenue },
        { fieldName: 'sales_month', synonym: mapping.date },
      ])

      // Default to believe for unrecognised format (safer: no payout filtering)
      believeManager.addFiles([pendingFile])
      toast.success(`"${pendingFile.name}" imported with custom column mapping`)
      setPendingFile(null)
      setPendingHeaders([])
    },
    [pendingFile, believeManager, onAddAliases]
  )

  const handleMappingCancel = useCallback(() => {
    toast.info(tToast('import_cancelled'))
    setPendingFile(null)
    setPendingHeaders([])
  }, [tToast])

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
      })),
    [makeRefSetter, handleReplaceInput]
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
          'relative border-2 border-dashed rounded-lg p-8 transition-all duration-200',
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

        <div className="flex flex-col items-center gap-3 pointer-events-none">
          <div
            className={[
              'p-4 rounded-full transition-colors',
              isDragging ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary',
            ].join(' ')}
          >
            {isAnyProcessing ? (
              <Spinner size={32} weight="bold" className="animate-spin" />
            ) : (
              <UploadSimple size={32} weight="bold" />
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
            {allFiles.map(({ file, source, state, onRemove, onReplace, replaceRef, onReplaceInput }, index) => (
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
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unknown CSV dialog — profile selection or manual mapping */}
      {pendingFile && pendingHasProfiles && (
        <ProfileSelectionDialog
          open={true}
          fileName={pendingFile.name}
          headers={pendingHeaders}
          profiles={csvProfiles}
          onSelectProfile={handleProfileSelected}
          onFallbackMapping={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}
      {pendingFile && !pendingHasProfiles && (
        <UnknownCSVMappingDialog
          open={true}
          headers={pendingHeaders}
          fileName={pendingFile.name}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}
    </div>
  )
}
