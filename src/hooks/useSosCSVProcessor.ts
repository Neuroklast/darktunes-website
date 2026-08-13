'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { computeAutoMappings } from '@/lib/sos/auto-mapping'
import { logClientAppEvent } from '@/lib/sos/clientAppLog'
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
import type { WorkerRequest, WorkerResponse, WorkerProcessConfig, WorkerResult } from '@/workers/sos-csv-processor.worker'

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
 * • `knownFileIdsRef` tracks which files have already been sent to the
 *   worker so that incremental adds/removes work correctly.
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
  darkmerchFiles: UploadedFile[] = []
) {
  const workerRef = useRef<Worker | null>(null)
  /** IDs of files that have been successfully sent to the worker for parsing. */
  const knownFileIdsRef = useRef(new Set<string>())
  /** Number of 'add-file' messages still awaiting 'parse-done' from the worker. */
  const pendingParsesRef = useRef(0)
  /** Latest config snapshot — updated synchronously so the parse-done handler uses it. */
  const latestConfigRef = useRef<WorkerProcessConfig | null>(null)
  /** The alias key that was in effect the last time files were synced with the worker. */
  const prevAliasKeyRef = useRef<string | undefined>(undefined)
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

  const aliasKey = config.csvAliases.map(a => `${a.fieldName}:${a.synonym}`).join(',')
  const believeKey = believeFiles.map(f => `${f.id}:${f.data?.length ?? 0}`).join(',')
  const bandcampKey = bandcampFiles.map(f => `${f.id}:${f.data?.length ?? 0}`).join(',')
  const shopifyKey = shopifyFiles.map(f => `${f.id}:${f.data?.length ?? 0}`).join(',')
  const printfulKey = printfulFiles.map(f => `${f.id}:${f.data?.length ?? 0}`).join(',')
  const darkmerchKey = darkmerchFiles.map(f => `${f.id}:${f.data?.length ?? 0}`).join(',')

  const configKey = [
    config.compilationFilters.map(f => f.id).join(','),
    config.artistMappings.map(m => m.id).join(','),
    config.splitFees.map(s => `${s.artist}:${s.percentage}:${s.digitalPercentage ?? ''}:${s.physicalPercentage ?? ''}`).join(','),
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
    // Never process with empty rates — avoids race toast for missing USD/etc.
    if (Object.keys(exchangeRatesRef.current).length === 0) {
      setIsProcessing(false)
      return
    }
    const cfg = latestConfigRef.current ?? buildConfig()
    workerRef.current?.postMessage({ type: 'process', config: cfg } satisfies WorkerRequest)
    setIsProcessing(true)
  }, [buildConfig])

  // Stable ref so worker-lifecycle effects can call the latest sendProcess
  // without taking it as a dependency (worker must only be created once).
  const sendProcessRef = useRef(sendProcess)
  sendProcessRef.current = sendProcess

  // ── Worker lifecycle ──────────────────────────────────────────────────────────

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/sos-csv-processor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case 'parse-progress':
          // Progress updates are currently consumed by useFileManager's own
          // parsing pass for the UI progress bars; we don't duplicate them here.
          break

        case 'parse-done':
          pendingParsesRef.current = Math.max(0, pendingParsesRef.current - 1)
          if (pendingParsesRef.current === 0) {
            sendProcessRef.current()
          }
          break

        case 'result':
          setWorkerResult(msg.data)
          setIsProcessing(false)
          break

        case 'error': {
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
            toast.error(labels('csvProcessingError'), { description: msg.message })
          }
          setIsProcessing(false)
          break
        }
      }
    }

    worker.onerror = (err) => {
      console.error('CSV Worker uncaught error:', err)
      const labels = tRef.current
      toast.error(labels('workerCrashed'), {
        description: err.message || labels('workerCrashedUnknown'),
      })
      setIsProcessing(false)
    }

    const knownFileIds = knownFileIdsRef.current
    return () => {
      worker.terminate()
      workerRef.current = null
      knownFileIds.clear()
      pendingParsesRef.current = 0
    }
  }, [])

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
        knownFileIdsRef.current.clear()
        pendingParsesRef.current = 0
      }
    }

    // Remove files that are no longer present
    for (const id of knownFileIdsRef.current) {
      if (!currentFileMap.has(id)) {
        worker.postMessage({ type: 'remove-file', fileId: id } satisfies WorkerRequest)
        knownFileIdsRef.current.delete(id)
      }
    }

    // Send newly added files (with data) to the worker
    let newFilesQueued = 0
    for (const [id, file] of currentFileMap.entries()) {
      if (!knownFileIdsRef.current.has(id) && file.data) {
        knownFileIdsRef.current.add(id)
        pendingParsesRef.current++
        newFilesQueued++
        worker.postMessage({
          type: 'add-file',
          fileId: id,
          content: file.data,
          source: file.type,
          customAliases: customAliasesRef.current,
        } satisfies WorkerRequest)
        setIsProcessing(true)
      }
    }

    // If all files were already known (no new adds) and there are no pending
    // parses, trigger a process with the current config immediately.
    if (newFilesQueued === 0 && pendingParsesRef.current === 0) {
      if (currentFileMap.size === 0) {
        // No files left — return empty result
        setWorkerResult(EMPTY_RESULT)
        setIsProcessing(false)
      } else {
        sendProcessRef.current()
      }
    }
  }, [believeKey, bandcampKey, shopifyKey, printfulKey, darkmerchKey, aliasKey])

  // ── Effect: re-process when config changes (no re-parse needed) ───────────────

  useEffect(() => {
    const cfg = buildConfig()
    latestConfigRef.current = cfg
    if (workerRef.current && pendingParsesRef.current === 0 && knownFileIdsRef.current.size > 0) {
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

  return {
    isProcessing,
    exchangeRatesLoading,
    exchangeRatesReady,
    exchangeRatesSource,
    exchangeRates,
    historicalRates,
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
  }
}

