'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { computeAutoMappings } from '@/lib/sos/auto-mapping'
import { logClientAppEvent } from '@/lib/sos/clientAppLog'
import { ExcelExportWorkerError } from '@/lib/sos/excelExportError'
import {
  FALLBACK_EXCHANGE_RATES,
  fetchExchangeRates,
  fetchHistoricalExchangeRates,
  parseMissingExchangeRateCurrency,
  type ExchangeRateSource,
  type ExchangeRates,
  type HistoricalRates,
} from '@/lib/sos/currency'
import { interpolate } from '@/lib/i18n/interpolate'
import type {
  UploadedFile,
  CompilationFilter,
  ArtistMapping,
  SplitFee,
  ManualRevenue,
  ExpenseEntry,
  ArtistRevenue,
  CSVColumnAlias,
  SafeProcessedArtistData,
  ArtistTreeNode,
  ArtistCollabNode,
  FilteredCompilation,
  LabelArtist,
  IgnoredEntry,
  TrackRevenueAssignment,
} from '@/lib/sos/types'
import type {
  SosParseDoneStats,
  SosParseProgress,
  SosProcessProgress,
} from '@/lib/sos/ingestProgress'
import { explainSosError } from '@/lib/sos/explainSosError'
import { fileParseFingerprint, planCsvWorkerFileSync } from '@/lib/sos/workerFileSync'
import { parseImportSample } from '@/lib/sos/ingest/importSample'
import { matchProfile, buildStreamingColumnMapping } from '@/lib/sos/ingest/parser-facade'
import type { CsvImportProfile } from '@/lib/sos/ingest/types'
import type {
  SosExcelBuildArgs,
  WorkerRequest,
  WorkerResponse,
  WorkerProcessConfig,
  WorkerResult,
} from '@/workers/sos-csv-processor.worker'

/** Safety cap. Original reports are CSV now, so this should not be the happy path. */
export const SOS_EXCEL_WORKER_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Raw tabs can only be rebuilt by re-processing the files the worker already
 * holds. Wait this long for the fresh `result` before failing the export.
 */
export const SOS_EXCEL_RESYNC_TIMEOUT_MS = 60 * 1000

/**
 * Worker states that mean "the raw rows are not in worker memory (anymore)".
 * Re-processing rebuilds them; the export retries exactly once.
 */
const RETRYABLE_EXCEL_ERROR_CODES = new Set([
  'EXCEL_WORKER_DATA_MISSING',
  'EXCEL_ARTIST_NOT_IN_WORKER',
])

interface PendingExcelRequest {
  /** Current worker request id — changes when a resync retry re-posts the job. */
  requestId: string
  attempts: number
  onProgress?: (phase: string, rows?: number) => void
  resolve: (blob: Blob | null) => void
  reject: (error: Error) => void
  /** Re-process the files, wait for the fresh result and post the build again. */
  retry: (error: { code?: string; message: string }) => void
}

export {
  ExcelExportWorkerError,
  type ExcelExportWorkerErrorCode,
} from '@/lib/sos/excelExportError'

export interface CsvProcessorEvents {
  onParseProgress?: (progress: SosParseProgress) => void
  onParseDone?: (stats: SosParseDoneStats) => void
  onParseError?: (fileId: string, message: string) => void
  onProcessProgress?: (progress: SosProcessProgress) => void
}

interface CSVProcessorConfig {
  compilationFilters: CompilationFilter[]
  artistMappings: ArtistMapping[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  /** Recoupable expense entries deducted per artist before split. */
  expenses: ExpenseEntry[]
  excludePhysical: boolean
  /** User-defined additional column synonyms from the CSV Column Mapping settings. */
  csvAliases: CSVColumnAlias[]
  /** Confirmed import profiles, applied to the worker rather than only the upload UI. */
  csvImportProfiles?: CsvImportProfile[]
  /** Label artist roster. When non-empty, only these artists appear in results. */
  labelArtists: LabelArtist[]
  /** Entries explicitly ignored in the statement of sales. */
  ignoredEntries: IgnoredEntry[]
  /** Label distribution fee percentage (0–100) deducted before artist splits. */
  distributionFeePercentage: number
  /** Optional override distribution fee (0–100) for digital revenue only. */
  distributionFeeDigital?: number
  /** Optional override distribution fee (0–100) for physical/merch revenue only. */
  distributionFeePhysical?: number
  /** Default artist split percentage (0–100) when no per-artist rule exists. */
  defaultSplitPercentage?: number
  /** Default digital split percentage (0–100); falls back to defaultSplitPercentage. */
  defaultSplitPercentageDigital?: number
  /** Default physical/merch split percentage (0–100); falls back to defaultSplitPercentage. */
  defaultSplitPercentagePhysical?: number
  /** Global per-source split percentage overrides; see DataProcessorConfig.sourceSplits. */
  sourceSplits?: { believe?: number; bandcamp?: number; darkmerch?: number; physical?: number }
  /**
   * Rules that re-attribute all revenue from a matching track/release to a
   * single owner artist.
   */
  trackRevenueAssignments?: TrackRevenueAssignment[]
  /** Opening balances from prior settlement period, keyed by artist name. */
  carryForwardByArtist?: Record<string, number>
}

const EMPTY_RESULT: WorkerResult = {
  processedData: [],
  artistTrees: [],
  collabTree: [],
  filteredCompilations: [],
  uniqueArtists: [],
  periodStart: '',
  periodEnd: '',
  totalGrossAllData: 0,
  releaseTitlesByArtistIncFeaturing: {},
  territoryMetrics: [],
  merchOrderRows: [],
}

/**
 * Drives the CSV Processor Web Worker.
 *
 * Key properties of this design
 * ──────────────────────────────
 * • Raw SalesTransaction objects never enter main-thread React state.
 *   They live only inside the worker until discarded after aggregation.
 * • The worker is a long-lived singleton; file content is sent once per file
 *   (on add) and config-only re-processing is cheap (no re-parse).
  * • `sentFingerprintRef` tracks the parse fingerprint last sent so a
   *   replace of the same file id re-parses instead of keeping the old rows.
 * • When csvAliases change the entire worker cache is reset and all files
 *   are re-parsed with the new column mappings.
 * • `pendingParsesRef` ensures we only send a 'process' message after all
 *   in-flight parses have completed (handles batch file drops gracefully).
 */
export function useCSVProcessor(
  believeFiles: UploadedFile[],
  bandcampFiles: UploadedFile[],
  config: CSVProcessorConfig,
  shopifyFiles: UploadedFile[] = [],
  printfulFiles: UploadedFile[] = [],
  darkmerchFiles: UploadedFile[] = [],
  events: CsvProcessorEvents = {},
) {
  const workerRef = useRef<Worker | null>(null)
  const sentFingerprintRef = useRef(new Map<string, string>())
  const processSeqRef = useRef(0)
  /** Number of 'add-file' messages still awaiting 'parse-done' from the worker. */
  const pendingParsesRef = useRef(0)
  /** Ignore stale completions from removed, replaced or reset files. */
  const pendingParseIdsRef = useRef(new Set<string>())
  /** A source parse error must block downstream statements, not produce partial totals. */
  const failedParseIdsRef = useRef(new Set<string>())
  /** A failed calculation is not automatically retried on incidental rerenders. */
  const processFailedRef = useRef(false)
  /** Latest config snapshot — updated synchronously so the parse-done handler uses it. */
  const latestConfigRef = useRef<WorkerProcessConfig | null>(null)
  /** The alias key that was in effect the last time files were synced with the worker. */
  const prevAliasKeyRef = useRef<string | undefined>(undefined)
  /** In-flight `build-excel` requests, keyed by requestId. */
  const pendingExcelRef = useRef(new Map<string, PendingExcelRequest>())
  /** Resolvers waiting for the next `result` after a re-process (export retry). */
  const resultWaitersRef = useRef<Array<(ok: boolean) => void>>([])

  /** Resolves true on the next worker `result`, false on timeout/error. */
  const waitForNextResult = useCallback((timeoutMs: number): Promise<boolean> => {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        settled = true
        resolve(false)
      }, timeoutMs)
      resultWaitersRef.current.push((ok) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(ok)
      })
    })
  }, [])
  /**
   * Requests abandoned by the timeout that the worker is still computing.
   * The worker is single-threaded and cannot be cancelled mid-serialization,
   * so new exports stay disabled until the orphaned result arrives.
   */
  const orphanExcelRef = useRef(new Set<string>())
  const [excelBusy, setExcelBusy] = useState(false)
  /** Grace timer: recreate the worker when an orphan never answers. */
  const orphanGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Bumped to terminate + recreate the worker and re-sync all files. */
  const [workerGeneration, setWorkerGeneration] = useState(0)
  /** Latest file arrays — updated every render so the file-sync effect reads current data. */
  const believeFilesRef = useRef(believeFiles)
  believeFilesRef.current = believeFiles
  const bandcampFilesRef = useRef(bandcampFiles)
  bandcampFilesRef.current = bandcampFiles
  const shopifyFilesRef = useRef(shopifyFiles)
  shopifyFilesRef.current = shopifyFiles
  const printfulFilesRef = useRef(printfulFiles)
  printfulFilesRef.current = printfulFiles
  const darkmerchFilesRef = useRef(darkmerchFiles)
  darkmerchFilesRef.current = darkmerchFiles
  /** Latest customAliases map — updated every render so the file-sync effect reads current data. */
  const customAliasesRef = useRef<Record<string, string[]>>({})

  const [workerResult, setWorkerResult] = useState<WorkerResult>(EMPTY_RESULT)
  const [isProcessing, setIsProcessing] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({})
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(true)
  const [exchangeRatesSource, setExchangeRatesSource] = useState<ExchangeRateSource | 'unknown'>('unknown')
  const [historicalRates, setHistoricalRates] = useState<HistoricalRates | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState<SosProcessProgress | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events
  const t = useTranslations('admin.accounting')
  const tRef = useRef(t)
  tRef.current = t

  /** Latest rates for process gate (worker lifecycle effect must not rebind). */
  const exchangeRatesRef = useRef(exchangeRates)
  exchangeRatesRef.current = exchangeRates

  const applyRateSource = useCallback((source: ExchangeRateSource) => {
    setExchangeRatesSource((prev) => {
      if (source === 'fallback') return 'fallback'
      if (prev === 'fallback') return 'fallback'
      return source
    })
  }, [])

  const notifyCurrencyFallback = useCallback(
    (period?: string) => {
      const title = t('currencyFallbackTitle')
      const description = t('currencyFallbackDescription')
      toast.warning(title, { description })
      void logClientAppEvent('sos.currency', title, 'warn', { period, description })
    },
    [t],
  )

  // ── Fetch ECB exchange rates once on mount ────────────────────────────────────

  useEffect(() => {
    fetchExchangeRates()
      .then((result) => {
        setExchangeRates(result.rates)
        setExchangeRatesSource(result.source)
        if (result.source === 'fallback') notifyCurrencyFallback()
      })
      .catch((err) => {
        console.warn('[useCSVProcessor] Exchange rate fetch failed unexpectedly:', err)
        setExchangeRates(FALLBACK_EXCHANGE_RATES)
        setExchangeRatesSource('fallback')
        notifyCurrencyFallback()
      })
      .finally(() => {
        setExchangeRatesLoading(false)
      })
  }, [notifyCurrencyFallback])

  // ── Fetch historical monthly rates when the detected period is known ──────────
  // Triggered whenever the worker detects a new billing period from the CSV data.
  // The historical rates (ECB monthly averages) provide more accurate EUR
  // conversion than a single current rate for retrospective statements.

  const { periodStart: detectedStart, periodEnd: detectedEnd } = workerResult
  useEffect(() => {
    if (!detectedStart || !detectedEnd) return

    setExchangeRatesLoading(true)
    fetchHistoricalExchangeRates(detectedStart, detectedEnd)
      .then((result) => {
        setHistoricalRates(result.rates)
        applyRateSource(result.source)
        if (result.source === 'fallback') {
          notifyCurrencyFallback(`${detectedStart}–${detectedEnd}`)
        }
      })
      .catch((err) => {
        console.warn('[useCSVProcessor] Historical exchange rate fetch failed:', err)
        applyRateSource('fallback')
        notifyCurrencyFallback(`${detectedStart}–${detectedEnd}`)
      })
      .finally(() => {
        setExchangeRatesLoading(false)
      })
  }, [detectedStart, detectedEnd, notifyCurrencyFallback, applyRateSource])

  // ── Manual refresh of exchange rates ─────────────────────────────────────────

  const refreshExchangeRates = useCallback(async () => {
    setExchangeRatesLoading(true)
    try {
      const [spot, historical] = await Promise.all([
        fetchExchangeRates(),
        detectedStart && detectedEnd
          ? fetchHistoricalExchangeRates(detectedStart, detectedEnd)
          : Promise.resolve(null),
      ])
      setExchangeRates(spot.rates)
      if (historical !== null) setHistoricalRates(historical.rates)
      const nextSource: ExchangeRateSource =
        spot.source === 'fallback' || historical?.source === 'fallback' ? 'fallback' : 'ecb'
      setExchangeRatesSource(nextSource)
      if (nextSource === 'fallback') {
        notifyCurrencyFallback(
          detectedStart && detectedEnd ? `${detectedStart}–${detectedEnd}` : undefined,
        )
      } else {
        toast.success(t('currencyRefreshSuccess'))
      }
    } catch (err) {
      console.warn('[useCSVProcessor] Exchange rate refresh failed:', err)
      setExchangeRates(FALLBACK_EXCHANGE_RATES)
      setExchangeRatesSource('fallback')
      notifyCurrencyFallback(
        detectedStart && detectedEnd ? `${detectedStart}–${detectedEnd}` : undefined,
      )
    } finally {
      setExchangeRatesLoading(false)
    }
  }, [detectedStart, detectedEnd, notifyCurrencyFallback, t])

  // ── Build stable derivative keys ─────────────────────────────────────────────

  const customAliases = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const alias of config.csvAliases) {
      if (!map[alias.fieldName]) map[alias.fieldName] = []
      map[alias.fieldName].push(alias.synonym)
    }
    return map
  }, [config.csvAliases])
  customAliasesRef.current = customAliases
  const profilesRef = useRef<CsvImportProfile[]>([])
  profilesRef.current = config.csvImportProfiles ?? []

  // Treat edits to confirmed mappings exactly like changes to custom aliases:
  // invalidate cached worker parses, never reuse rows mapped with old rules.
  const profileKey = JSON.stringify(config.csvImportProfiles ?? [])
  const aliasKey = config.csvAliases.map(a => `${a.fieldName}:${a.synonym}`).join(',') + profileKey
  const believeKey = believeFiles.map(f => fileParseFingerprint(f.id, f.data ?? '')).join(',')
  const bandcampKey = bandcampFiles.map(f => fileParseFingerprint(f.id, f.data ?? '')).join(',')
  const shopifyKey = shopifyFiles.map(f => fileParseFingerprint(f.id, f.data ?? '')).join(',')
  const printfulKey = printfulFiles.map(f => fileParseFingerprint(f.id, f.data ?? '')).join(',')
  const darkmerchKey = darkmerchFiles.map(f => fileParseFingerprint(f.id, f.data ?? '')).join(',')

  const configKey = [
    config.compilationFilters.map(f => f.id).join(','),
    config.artistMappings.map(m => m.id).join(','),
    config.splitFees.map(s => `${s.artist}:${s.percentage}:${s.digitalPercentage ?? ''}:${s.physicalPercentage ?? ''}:${JSON.stringify(s.sourceOverrides ?? [])}:${JSON.stringify(s.releaseOverrides ?? [])}`).join(','),
    config.manualRevenues.map(r => r.id).join(','),
    config.expenses.map(e => `${e.id}:${e.amount}`).join(','),
    String(config.excludePhysical),
    Object.keys(exchangeRates).length > 0 ? 'rates' : 'no-rates',
    historicalRates !== null ? `hist:${Object.keys(historicalRates).length}` : 'no-hist',
    config.labelArtists.map(la => la.id).join(','),
    config.ignoredEntries.map(ie => ie.id).join(','),
    String(config.distributionFeePercentage),
    String(config.distributionFeeDigital ?? ''),
    String(config.distributionFeePhysical ?? ''),
    String(config.defaultSplitPercentage ?? ''),
    String(config.defaultSplitPercentageDigital ?? ''),
    String(config.defaultSplitPercentagePhysical ?? ''),
    JSON.stringify(config.sourceSplits ?? {}),
    config.trackRevenueAssignments?.map(r => `${r.id}:${r.trackTitle}:${r.ownerArtist}`).join(',') ?? '',
    JSON.stringify(config.carryForwardByArtist ?? {}),
  ].join('|')

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const buildConfig = useCallback((): WorkerProcessConfig => ({
    compilationFilters: config.compilationFilters,
    artistMappings: config.artistMappings,
    splitFees: config.splitFees,
    manualRevenues: config.manualRevenues,
    expenses: config.expenses,
    excludePhysical: config.excludePhysical,
    exchangeRates,
    historicalExchangeRates: historicalRates ?? undefined,
    labelArtists: config.labelArtists,
    ignoredEntries: config.ignoredEntries,
    distributionFeePercentage: config.distributionFeePercentage,
    distributionFeeDigital: config.distributionFeeDigital,
    distributionFeePhysical: config.distributionFeePhysical,
    defaultSplitPercentage: config.defaultSplitPercentage,
    defaultSplitPercentageDigital: config.defaultSplitPercentageDigital,
    defaultSplitPercentagePhysical: config.defaultSplitPercentagePhysical,
    sourceSplits: config.sourceSplits,
    trackRevenueAssignments: config.trackRevenueAssignments,
    carryForwardByArtist: config.carryForwardByArtist,
  }), [config.compilationFilters, config.artistMappings, config.splitFees, config.manualRevenues, config.expenses, config.excludePhysical, exchangeRates, historicalRates, config.labelArtists, config.ignoredEntries, config.distributionFeePercentage, config.distributionFeeDigital, config.distributionFeePhysical, config.defaultSplitPercentage, config.defaultSplitPercentageDigital, config.defaultSplitPercentagePhysical, config.sourceSplits, config.trackRevenueAssignments, config.carryForwardByArtist])

  const sendProcess = useCallback(() => {
    if (processFailedRef.current) return
    // Never process with empty rates — avoids race toast for missing USD/etc.
    if (Object.keys(exchangeRatesRef.current).length === 0) {
      setIsProcessing(false)
      return
    }
    if (pendingExcelRef.current.size > 0) {
      const stale = new ExcelExportWorkerError(
        'The sales files or rules changed after this export started. The file was not downloaded. Export again.',
        { code: 'EXCEL_STALE_REVISION' },
      )
      for (const pending of pendingExcelRef.current.values()) pending.reject(stale)
      pendingExcelRef.current.clear()
      if (orphanExcelRef.current.size === 0) setExcelBusy(false)
    }
    const cfg = latestConfigRef.current ?? buildConfig()
    const requestId = processSeqRef.current + 1
    processSeqRef.current = requestId
    workerRef.current?.postMessage({ type: 'process', config: cfg, requestId } satisfies WorkerRequest)
    setIsProcessing(true)
  }, [buildConfig])

  // Stable ref so worker-lifecycle effects can call the latest sendProcess
  // without taking it as a dependency (worker must only be created once).
  const sendProcessRef = useRef(sendProcess)
  sendProcessRef.current = sendProcess

  // ── Worker lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    // A recreated worker starts empty — re-send every file so parsing runs again.
    if (workerGeneration > 0) {
      sentFingerprintRef.current.clear()
      pendingParsesRef.current = 0
      pendingParseIdsRef.current.clear()
      failedParseIdsRef.current.clear()
      processFailedRef.current = false
      prevAliasKeyRef.current = undefined
    }

    const worker = new Worker(
      new URL('../workers/sos-csv-processor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    const resolveResultWaiters = (ok: boolean) => {
      for (const waiter of resultWaitersRef.current.splice(0)) waiter(ok)
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case 'parse-progress':
          eventsRef.current.onParseProgress?.({
            fileId: msg.fileId,
            phase: msg.phase,
            percentage: msg.percentage,
            processedRows: msg.processedRows,
            totalRows: msg.totalRows,
          })
          break

        case 'parse-done':
          // A late event from a removed/replaced file must not decrement a
          // different import's pending count or mark its archive as complete.
          if (!pendingParseIdsRef.current.delete(msg.fileId)) break
          pendingParsesRef.current = pendingParseIdsRef.current.size
          eventsRef.current.onParseDone?.({
            fileId: msg.fileId,
            rowsParsed: msg.rowsParsed,
            rowsSkipped: msg.rowsSkipped,
            uniqueArtistsCount: msg.uniqueArtistsCount,
            emptyCurrencyRows: msg.emptyCurrencyRows ?? 0,
            skipReasons: msg.skipReasons ?? [],
            periodStart: msg.periodStart ?? '',
            periodEnd: msg.periodEnd ?? '',
          })
          if (pendingParsesRef.current === 0) {
            if (failedParseIdsRef.current.size === 0) sendProcessRef.current()
            else {
              setWorkerResult(EMPTY_RESULT)
              setIsProcessing(false)
            }
          }
          break

        case 'process-progress':
          if (msg.requestId !== undefined && msg.requestId !== processSeqRef.current) break
          setPipelineProgress({ phase: msg.phase, percentage: msg.percentage })
          eventsRef.current.onProcessProgress?.({
            phase: msg.phase,
            percentage: msg.percentage,
          })
          break

        case 'result':
          if (msg.requestId !== undefined && msg.requestId !== processSeqRef.current) break
          setWorkerResult(msg.data)
          setPipelineProgress(null)
          setIsProcessing(false)
          resolveResultWaiters(true)
          break

        case 'error': {
          if (msg.requestId !== undefined && msg.requestId !== processSeqRef.current) break
          resolveResultWaiters(false)
          console.error('CSV Worker error:', msg.message)
          const labels = tRef.current
          const missingCurrency = parseMissingExchangeRateCurrency(msg.message)
          if (missingCurrency) {
            toast.error(labels('currencyMissingRateTitle'), {
              description: interpolate(labels('currencyMissingRateDesc'), {
                currency: missingCurrency,
              }),
            })
          } else {
            toast.error(labels('csvProcessingError'), {
              description: explainSosError(msg.message, {
                explainCsvParse: labels('explainCsvParse'),
                explainNetwork: labels('explainNetwork'),
                explainUnknown: labels('explainUnknown'),
                explainFailed: labels('explainFailed'),
                explainStorage: labels('explainStorage'),
                explainTimeout: labels('explainTimeout'),
                explainSession: labels('explainSession'),
              }),
            })
          }
          setPipelineProgress(null)
          if (msg.fileId) {
            // A parse failure is an invalid source file, not a failed
            // calculation that should spin in an infinite retry loop.
            failedParseIdsRef.current.add(msg.fileId)
            if (pendingParseIdsRef.current.delete(msg.fileId)) {
              pendingParsesRef.current = pendingParseIdsRef.current.size
            }
            eventsRef.current.onParseError?.(msg.fileId, msg.message)
          }
          if (!msg.fileId) processFailedRef.current = true
          // Never keep the last successful financial result after a failed
          // parse or reconciliation. Explicit file replacement is required.
          setWorkerResult(EMPTY_RESULT)
          if (pendingParsesRef.current === 0) setIsProcessing(false)
          break
        }

        case 'excel-progress': {
          pendingExcelRef.current.get(msg.requestId)?.onProgress?.(msg.phase, msg.rows)
          break
        }

        case 'excel-done': {
          const pending = pendingExcelRef.current.get(msg.requestId)
          if (pending) {
            pendingExcelRef.current.delete(msg.requestId)
            const mime =
              msg.kind === 'zip'
                ? 'application/zip'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            pending.resolve(new Blob([msg.buffer], { type: mime }))
          }
          if (orphanExcelRef.current.delete(msg.requestId) && orphanExcelRef.current.size === 0) {
            setExcelBusy(false)
            if (orphanGraceTimerRef.current) {
              clearTimeout(orphanGraceTimerRef.current)
              orphanGraceTimerRef.current = null
            }
          }
          break
        }

        case 'excel-error': {
          console.error('CSV Worker excel error:', msg.message)
          const pending = pendingExcelRef.current.get(msg.requestId)
          if (
            pending &&
            msg.code &&
            RETRYABLE_EXCEL_ERROR_CODES.has(msg.code) &&
            pending.attempts < 1
          ) {
            // The raw rows are no longer in worker memory (worker recreated or
            // data replaced). Drop the request from the map first so the
            // re-process below is not treated as a stale revision, then retry
            // once after the fresh result arrives.
            pendingExcelRef.current.delete(msg.requestId)
            pending.retry({ code: msg.code, message: msg.message })
            break
          }
          if (pending) {
            pendingExcelRef.current.delete(msg.requestId)
            pending.reject(
              new ExcelExportWorkerError(msg.message, {
                code: msg.code,
                rows: msg.rows,
                limit: msg.limit,
              }),
            )
          }
          if (orphanExcelRef.current.delete(msg.requestId) && orphanExcelRef.current.size === 0) {
            setExcelBusy(false)
            if (orphanGraceTimerRef.current) {
              clearTimeout(orphanGraceTimerRef.current)
              orphanGraceTimerRef.current = null
            }
          }
          break
        }
      }
    }

    worker.onerror = (err) => {
      console.error('CSV Worker uncaught error:', err)
      resolveResultWaiters(false)
      const labels = tRef.current
      toast.error(labels('workerCrashed'), {
        description: explainSosError(err.message || labels('workerCrashedUnknown'), {
          explainUnknown: labels('explainUnknown'),
          explainFailed: labels('explainFailed'),
        }),
      })
      setIsProcessing(false)
      setWorkerResult(EMPTY_RESULT)
      for (const pending of pendingExcelRef.current.values()) {
        pending.reject(new Error(err.message || 'Worker crashed'))
      }
      pendingExcelRef.current.clear()
      orphanExcelRef.current.clear()
      setExcelBusy(false)
      if (orphanGraceTimerRef.current) {
        clearTimeout(orphanGraceTimerRef.current)
        orphanGraceTimerRef.current = null
      }
    }

    const sentFingerprints = sentFingerprintRef.current
    const pendingExcel = pendingExcelRef.current
    const orphanExcel = orphanExcelRef.current
    return () => {
      worker.terminate()
      workerRef.current = null
      resolveResultWaiters(false)
      sentFingerprints.clear()
      pendingParsesRef.current = 0
      pendingParseIdsRef.current.clear()
      failedParseIdsRef.current.clear()
      processFailedRef.current = false
      for (const pending of pendingExcel.values()) pending.resolve(null)
      pendingExcel.clear()
      orphanExcel.clear()
      if (orphanGraceTimerRef.current) {
        clearTimeout(orphanGraceTimerRef.current)
        orphanGraceTimerRef.current = null
      }
    }
  }, [workerGeneration])

  // ── Effect: sync files with worker ────────────────────────────────────────────
  // Triggers when file content changes or when column aliases change.

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return

    const allFiles = [
      ...believeFilesRef.current,
      ...bandcampFilesRef.current,
      ...shopifyFilesRef.current,
      ...printfulFilesRef.current,
      ...darkmerchFilesRef.current,
    ]
    const currentFileMap = new Map(
      allFiles.filter(f => f.data).map(f => [f.id, f])
    )

    // When aliases change, reset the worker's internal cache and re-send all files
    // (because column mappings affect which CSV columns get parsed).
    if (prevAliasKeyRef.current !== aliasKey) {
      const isFirstRun = prevAliasKeyRef.current === undefined
      prevAliasKeyRef.current = aliasKey
      if (!isFirstRun) {
        // Aliases actually changed — reset the worker cache.
        worker.postMessage({ type: 'reset' } satisfies WorkerRequest)
        sentFingerprintRef.current.clear()
        pendingParsesRef.current = 0
        pendingParseIdsRef.current.clear()
        failedParseIdsRef.current.clear()
        processFailedRef.current = false
      }
    }

    const { toRemove, toAdd } = planCsvWorkerFileSync(
      [...currentFileMap.values()],
      sentFingerprintRef.current,
    )
    if (toRemove.length > 0 || toAdd.length > 0) processFailedRef.current = false

    for (const id of toRemove) {
      worker.postMessage({ type: 'remove-file', fileId: id } satisfies WorkerRequest)
      sentFingerprintRef.current.delete(id)
      pendingParseIdsRef.current.delete(id)
      failedParseIdsRef.current.delete(id)
    }
    pendingParsesRef.current = pendingParseIdsRef.current.size

    let newFilesQueued = 0
    for (const id of toAdd) {
      const file = currentFileMap.get(id)
      if (!file?.data) continue
      sentFingerprintRef.current.set(id, fileParseFingerprint(id, file.data))
      failedParseIdsRef.current.delete(id)
      pendingParseIdsRef.current.add(id)
      pendingParsesRef.current = pendingParseIdsRef.current.size
      newFilesQueued++
      setWorkerResult(EMPTY_RESULT)
      worker.postMessage({
        type: 'add-file',
        fileId: id,
        content: file.data,
        source: file.type,
        customAliases: customAliasesRef.current,
        columnMapping: file.type === 'believe' || file.type === 'bandcamp'
          ? (() => {
              try {
                const headers = parseImportSample(file.data.slice(0, 256 * 1024)).headers
                const profile = matchProfile(headers, profilesRef.current)
                return profile?.type === 'financial'
                  ? buildStreamingColumnMapping(profile, headers)
                  : undefined
              } catch {
                return undefined
              }
            })()
          : undefined,
      } satisfies WorkerRequest)
      setIsProcessing(true)
    }

    // If all files were already known (no new adds) and there are no pending
    // parses, trigger a process with the current config immediately.
    if (newFilesQueued === 0 && pendingParsesRef.current === 0) {
      if (failedParseIdsRef.current.size > 0) {
        setWorkerResult(EMPTY_RESULT)
        setIsProcessing(false)
      } else if (currentFileMap.size === 0) {
        // No files left — return empty result
        setWorkerResult(EMPTY_RESULT)
        setIsProcessing(false)
      } else {
        sendProcessRef.current()
      }
    }
  }, [believeKey, bandcampKey, shopifyKey, printfulKey, darkmerchKey, aliasKey, workerGeneration])

  // ── Effect: re-process when config changes (no re-parse needed) ───────────────

  useEffect(() => {
    const cfg = buildConfig()
    latestConfigRef.current = cfg
    if (workerRef.current && !processFailedRef.current && pendingParsesRef.current === 0 && failedParseIdsRef.current.size === 0 && sentFingerprintRef.current.size > 0) {
      sendProcessRef.current()
    }
  }, [configKey, buildConfig])

  // ── Derived values ─────────────────────────────────────────────────────────────

  const revenues: ArtistRevenue[] = useMemo(
    () =>
      workerResult.processedData.map((data: SafeProcessedArtistData) => ({
        artist: data.artist,
        believeRevenue: data.believeRevenue,
        bandcampRevenue: data.bandcampRevenue,
        darkmerchRevenue: data.darkmerchRevenue,
        manualRevenue: data.manualRevenue,
        totalRevenue: data.grossRevenue,
        splitPercentage: data.splitPercentage,
        finalAmount: data.finalPayout,
        openingBalanceEur: data.openingBalanceEur,
        amountDueEur: data.amountDueEur,
        totalQuantity: data.totalQuantity,
        totalExpenses: data.totalExpenses,
        distributionFeeDeducted: data.distributionFeeDeducted,
        totalStreamRevenue: data.totalStreamRevenue,
        totalDownloadRevenue: data.totalDownloadRevenue,
        platformBreakdown: data.platformBreakdown,
        countryBreakdown: data.countryBreakdown,
        monthlyBreakdown: data.monthlyBreakdown,
        releaseBreakdown: data.releaseBreakdown,
        physicalReleasesRevenue: data.physicalReleasesRevenue ?? (data.totalPhysicalRevenue - data.darkmerchRevenue),
        digitalSplitPercentage: data.digitalSplitPercentage ?? data.splitPercentage,
        believeSplitPercentage: data.believeSplitPercentage ?? data.digitalSplitPercentage ?? data.splitPercentage,
        bandcampSplitPercentage: data.bandcampSplitPercentage ?? data.digitalSplitPercentage ?? data.splitPercentage,
        physicalSplitPercentage: data.physicalSplitPercentage ?? data.splitPercentage,
        darkmerchSplitPercentage: data.darkmerchSplitPercentage ?? data.splitPercentage,
      })),
    [workerResult.processedData]
  )

  const autoMappings = useMemo(
    () => computeAutoMappings(workerResult.uniqueArtists, config.artistMappings),
    [workerResult.uniqueArtists, config.artistMappings]
  )

  const exchangeRatesReady = Object.keys(exchangeRates).length > 0

  const requestExcelBlob = useCallback((
    args: SosExcelBuildArgs,
    onProgress?: (phase: string, rows?: number) => void,
  ): Promise<Blob | null> => {
    const worker = workerRef.current
    if (!worker) {
      return Promise.reject(
        new ExcelExportWorkerError('Excel worker is not ready. Please retry the export.', {
          code: 'EXCEL_WORKER_NOT_READY',
        }),
      )
    }
    if (pendingExcelRef.current.size > 0 || orphanExcelRef.current.size > 0) {
      return Promise.reject(
        new ExcelExportWorkerError(
          'An Excel export is already running. Wait until it finishes, then retry.',
          { code: 'EXCEL_BUSY' },
        ),
      )
    }
    const initialRequestId = crypto.randomUUID()
    const signal = AbortSignal.timeout(SOS_EXCEL_WORKER_TIMEOUT_MS)
    return new Promise((resolve, reject) => {
      const cleanup = () => signal.removeEventListener('abort', onAbort)

      const entry: PendingExcelRequest = {
        requestId: initialRequestId,
        attempts: 0,
        onProgress,
        resolve: (blob) => {
          pendingExcelRef.current.delete(entry.requestId)
          cleanup()
          if (pendingExcelRef.current.size === 0 && orphanExcelRef.current.size === 0) {
            setExcelBusy(false)
          }
          resolve(blob)
        },
        reject: (error) => {
          pendingExcelRef.current.delete(entry.requestId)
          cleanup()
          if (pendingExcelRef.current.size === 0 && orphanExcelRef.current.size === 0) {
            setExcelBusy(false)
          }
          reject(error)
        },
        retry: (error) => {
          entry.attempts += 1
          entry.onProgress?.('resync')
          // Without files in the worker there is nothing to rebuild.
          if (sentFingerprintRef.current.size === 0 && pendingParsesRef.current === 0) {
            entry.reject(new ExcelExportWorkerError(error.message, { code: error.code }))
            return
          }
          if (sentFingerprintRef.current.size > 0 && pendingParsesRef.current === 0) {
            sendProcessRef.current()
          }
          void waitForNextResult(SOS_EXCEL_RESYNC_TIMEOUT_MS).then((ok) => {
            if (!ok) {
              if (!signal.aborted) {
                entry.reject(new ExcelExportWorkerError(error.message, { code: error.code }))
              }
              return
            }
            if (signal.aborted) return
            const nextRequestId = crypto.randomUUID()
            entry.requestId = nextRequestId
            pendingExcelRef.current.set(nextRequestId, entry)
            postBuild(nextRequestId)
          })
        },
      }

      const postBuild = (requestId: string) => {
        worker.postMessage({
          type: 'build-excel',
          requestId,
          inputRevision: processSeqRef.current,
          artist: args.artist,
          artistData: args.artistData,
          labelInfo: args.labelInfo,
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
          compilationFilters: args.compilationFilters,
          settings: args.settings,
        } satisfies WorkerRequest)
      }

      const onAbort = () => {
        // Only orphan a request the worker is still computing. A request that
        // is waiting for its re-process has no build in flight.
        if (pendingExcelRef.current.has(entry.requestId)) {
          orphanExcelRef.current.add(entry.requestId)
          setExcelBusy(true)
          if (orphanGraceTimerRef.current) clearTimeout(orphanGraceTimerRef.current)
          orphanGraceTimerRef.current = setTimeout(() => {
            // The worker never answered the orphan — terminate and recreate it.
            // The file-sync effect re-sends every CSV for the new generation.
            orphanGraceTimerRef.current = null
            console.error('[useCSVProcessor] Excel worker unresponsive — recreating worker')
            const stuckWorker = workerRef.current
            workerRef.current = null
            stuckWorker?.terminate()
            for (const pending of pendingExcelRef.current.values()) {
              pending.reject(
                new ExcelExportWorkerError(
                  'Excel worker was unresponsive and has been restarted. Please retry the export.',
                  { code: 'EXCEL_TIMEOUT' },
                ),
              )
            }
            pendingExcelRef.current.clear()
            orphanExcelRef.current.clear()
            setExcelBusy(false)
            setIsProcessing(false)
            setWorkerGeneration((generation) => generation + 1)
          }, SOS_EXCEL_WORKER_TIMEOUT_MS)
        }
        entry.reject(
          new ExcelExportWorkerError('Excel export timed out after 5 minutes', {
            code: 'EXCEL_TIMEOUT',
          }),
        )
      }
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      pendingExcelRef.current.set(entry.requestId, entry)
      setExcelBusy(true)
      postBuild(entry.requestId)
    })
  }, [waitForNextResult])

  return {
    isProcessing,
    excelBusy,
    exchangeRatesLoading,
    exchangeRatesReady,
    exchangeRatesSource,
    exchangeRates,
    historicalRates,
    pipelineProgress,
    refreshExchangeRates,
    uniqueArtists: workerResult.uniqueArtists,
    processedData: workerResult.processedData as SafeProcessedArtistData[],
    artistTrees: workerResult.artistTrees as ArtistTreeNode[],
    collabTree: workerResult.collabTree as ArtistCollabNode[],
    filteredCompilations: workerResult.filteredCompilations as FilteredCompilation[],
    revenues,
    autoMappings,
    detectedPeriodStart: workerResult.periodStart,
    detectedPeriodEnd: workerResult.periodEnd,
    totalGrossAllData: workerResult.totalGrossAllData,
    releaseTitlesByArtistIncFeaturing: workerResult.releaseTitlesByArtistIncFeaturing,
    territoryMetrics: workerResult.territoryMetrics,
    merchOrderRows: workerResult.merchOrderRows,
    requestExcelBlob,
    cancelExcelExport: () => {
      const cancelled = new ExcelExportWorkerError(
        'The Excel export was cancelled. Nothing was downloaded.',
        { code: 'EXCEL_CANCELLED' },
      )
      for (const pending of pendingExcelRef.current.values()) pending.reject(cancelled)
      pendingExcelRef.current.clear()
      orphanExcelRef.current.clear()
      if (orphanGraceTimerRef.current) {
        clearTimeout(orphanGraceTimerRef.current)
        orphanGraceTimerRef.current = null
      }
      const stuckWorker = workerRef.current
      workerRef.current = null
      stuckWorker?.terminate()
      setExcelBusy(false)
      setIsProcessing(false)
      setWorkerGeneration((generation) => generation + 1)
    },
  }
}

