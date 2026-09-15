/**
 * CSV Processor Web Worker
 *
 * Architecture overview
 * ─────────────────────
 * This worker owns the entire CSV → aggregated-data pipeline so that the main
 * thread never holds raw SalesTransaction objects in memory.
 *
 * Protocol (Main → Worker)
 *   add-file     Parse a CSV file and store its transactions (or raw buffer
 *                data for Shopify/Printful) internally.
 *   remove-file  Remove a previously added file from all internal stores.
 *   process      Reconcile e-commerce buffers, run processTransactionsWithCompilations
 *                + buildArtistTree + buildArtistCollabTree on all transactions,
 *                then post the aggregated result WITHOUT any raw transaction arrays.
 *   build-excel  Build one artist xlsx in the worker (summary + original-report
 *                tabs). Only the buffer is transferred.
 *   reset        Clear all stored data (e.g. when column aliases change).
 *
 * E-Commerce staging (Schritt 2)
 * ────────────────────────────────
 * Shopify files are parsed into raw ShopifyRawOrder arrays and held in
 * `shopifyRawOrdersMap` (keyed by fileId). Printful files are parsed into
 * PrintfulRawCost arrays in `printfulRawCostsMap`. On every `process` call
 * both buffers are reconciled via `reconcileMerchTransactions` and the
 * resulting SalesTransactions are merged with the believe/bandcamp transactions.
 *
 * This ensures that:
 *  - A Shopify-only upload immediately produces artist-attributed transactions
 *    (with full subtotal as net, since Printful costs = []).
 *  - When Printful data is later added, the next `process` call updates the
 *    net revenue figures without requiring a full re-parse.
 *  - No Printful match for a Shopify order is silently acceptable (CDs/Vinyl
 *    are self-fulfilled and have no Printful cost entry).
 */

import { normalizeRevenueToEur } from '../lib/sos/currency'
import { parseCSVContentStreaming } from '../lib/sos/ingest/streaming-csv-parser'
import { parseShopifyRaw, reconcileMerchTransactions } from '../lib/sos/ingest/ecommerce-merger'
import type { ShopifyRawOrder } from '../lib/sos/ingest/ecommerce-merger'
import { parsePrintfulCSV } from '../lib/sos/ingest/printful-parser'
import type { PrintfulRawCost } from '../lib/sos/ingest/ecommerce-merger'
import { parseDarkmerchCSV } from '../lib/sos/ingest/darkmerch-parser'
import {
  processTransactionsWithCompilations,
  buildArtistTree,
  aggregateTerritoryMetrics,
} from '../lib/sos/data-processor'
import type { TerritoryMetricRow } from '../lib/sos/data-processor'
import { buildMerchOrderRows, type MerchOrderRow } from '../lib/sos/merchOrderRows'
import {
  buildArtistRawSheets,
  missingOriginalReportSources,
} from '../lib/sos/export/rawSourceRows'
import {
  isExcelSheetEnabled,
  normalizeExcelExportSettings,
  type ExcelExportSettingsPatch,
} from '../lib/sos/excelExportSettings'
import { generateExcel } from '../lib/sos/export/excelStatement'
import { normalizeArtistNameKey } from '../lib/sos/artistNameKey'
import { periodBoundsFromMonths } from '../lib/sos/ingestProgress'
import type { ProcessedArtistData } from '../lib/sos/data-processor'
import { buildArtistCollabTree } from '../lib/sos/grouping'
import type { SalesTransaction } from '../lib/sos/ingest/csv-parser'
import { extractFeaturedArtistsDetailed } from '../lib/sos/ingest/csv-parser'
import type {
  SafeProcessedArtistData,
  LabelInfo,
  PdfExportSettings,
  ArtistTreeNode,
  ArtistCollabNode,
  FilteredCompilation,
  CompilationFilter,
  ArtistMapping,
  SplitFee,
  ManualRevenue,
  ExpenseEntry,
  LabelArtist,
  IgnoredEntry,
  TrackRevenueAssignment,
} from '../lib/sos/types'
import type { ExchangeRates, HistoricalRates } from '../lib/sos/currency'

// ── Message type definitions ──────────────────────────────────────────────────

/**
 * Regex that matches the canonical sales-month format used throughout the
 * data model. Only strings that match this pattern are valid as `sales_month`
 * values in `SalesTransaction` and as period-bound inputs to HTML
 * `<input type="month">` elements.
 */
const VALID_MONTH_RE = /^\d{4}-\d{2}$/

export interface WorkerProcessConfig {
  compilationFilters: CompilationFilter[]
  artistMappings: ArtistMapping[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  /** Recoupable expenses deducted per artist before split. */
  expenses: ExpenseEntry[]
  excludePhysical: boolean
  /** ECB exchange rates (1 EUR = N units of foreign currency). */
  exchangeRates: ExchangeRates
  /**
   * Historical monthly average exchange rates keyed by "YYYY-MM".
   * When provided, each Bandcamp transaction is converted at the ECB average
   * rate for its own `sales_month` rather than a single current rate.
   */
  historicalExchangeRates?: HistoricalRates
  /** Label artist roster — when non-empty only these artists appear in results. */
  labelArtists: LabelArtist[]
  /** Entries explicitly ignored in the statement of sales. */
  ignoredEntries: IgnoredEntry[]
  /** Label distribution fee percentage (0–100) deducted before artist splits. */
  distributionFeePercentage: number
  /** Optional override distribution fee (0–100) for digital revenue only. */
  distributionFeeDigital?: number
  /** Optional override distribution fee (0–100) for physical/merch revenue only. */
  distributionFeePhysical?: number
  /** Default artist split percentage (0–100) when no per-artist SplitFee rule exists. */
  defaultSplitPercentage?: number
  /** Default digital split percentage (0–100); falls back to defaultSplitPercentage. */
  defaultSplitPercentageDigital?: number
  /** Default physical/merch split percentage (0–100); falls back to defaultSplitPercentage. */
  defaultSplitPercentagePhysical?: number
  /** Global per-source split percentage overrides; see DataProcessorConfig.sourceSplits. */
  sourceSplits?: { believe?: number; bandcamp?: number; darkmerch?: number; physical?: number }
  /**
   * Rules that re-attribute all revenue from a matching track/release to a
   * single owner artist.  Forwarded unchanged to the data-processor pipeline.
   */
  trackRevenueAssignments?: TrackRevenueAssignment[]
  /** Opening balances from prior settlement period, keyed by artist name. */
  carryForwardByArtist?: Record<string, number>
}

export interface WorkerResult {
  processedData: SafeProcessedArtistData[]
  artistTrees: ArtistTreeNode[]
  collabTree: ArtistCollabNode[]
  filteredCompilations: FilteredCompilation[]
  uniqueArtists: string[]
  periodStart: string
  periodEnd: string
  /** EUR-normalised gross revenue across ALL uploaded records, before any
   *  roster filter or ignored-entry filter is applied. Used to display a
   *  "total revenue" figure that includes non-roster artists. */
  totalGrossAllData: number
  /**
   * Map of artist name → sorted, de-duplicated release titles, covering both
   * primary (main) artists AND artists that appear as featured artists.
   * Computed directly from raw transactions so that featuring artists who are
   * not in the roster still have their releases listed.
   */
  releaseTitlesByArtistIncFeaturing: Record<string, string[]>
  /** Monthly territory metrics — serialisable gold-layer facts for analytics. */
  territoryMetrics: TerritoryMetricRow[]
  /** Normalised merch line items for portal merch analytics. */
  merchOrderRows: MerchOrderRow[]
}

export type WorkerRequest =
  | { type: 'add-file'; fileId: string; content: string; source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'; customAliases: Record<string, string[]> }
  | { type: 'remove-file'; fileId: string }
  | { type: 'process'; config: WorkerProcessConfig }
  | { type: 'reset' }
  | {
      type: 'build-excel'
      requestId: string
      artist: string
      artistData: SafeProcessedArtistData
      labelInfo: LabelInfo
      periodStart?: string
      periodEnd?: string
      compilationFilters: CompilationFilter[]
      settings?: ExcelExportSettingsPatch | Partial<PdfExportSettings>
    }

export type SosExcelBuildArgs = Omit<Extract<WorkerRequest, { type: 'build-excel' }>, 'type' | 'requestId'>

export type WorkerResponse =
  | {
      type: 'parse-progress'
      fileId: string
      percentage: number
      phase: 'tokenizing' | 'parsing'
      processedRows?: number
      totalRows?: number
    }
  | {
      type: 'parse-done'
      fileId: string
      rowsParsed: number
      rowsSkipped: number
      uniqueArtistsCount: number
      emptyCurrencyRows?: number
      skipReasons?: string[]
      periodStart?: string
      periodEnd?: string
    }
  | {
      type: 'process-progress'
      phase: 'aggregating' | 'summaries' | 'finalizing'
      percentage: number
    }
  | { type: 'result'; data: WorkerResult }
  | { type: 'error'; message: string; fileId?: string }
  | { type: 'excel-done'; requestId: string; buffer: ArrayBuffer; kind: 'zip' | 'xlsx' }
  | { type: 'excel-progress'; requestId: string; phase: string; rows?: number }
  | { type: 'excel-error'; requestId: string; message: string }

// ── Internal worker state ──────────────────────────────────────────────────────

/** Parsed transactions for believe / bandcamp files, keyed by file ID. */
const fileTransactions = new Map<string, SalesTransaction[]>()

/** Last process result including transactions — worker-only, never posted. */
let lastProcessedArtistData: ProcessedArtistData[] = []

/**
 * Raw Shopify order groups, keyed by file ID.
 * These are staged until `runProcess` calls `reconcileMerchTransactions`.
 */
const shopifyRawOrdersMap = new Map<string, ShopifyRawOrder[]>()

/**
 * Raw Printful cost rows, keyed by file ID.
 * Reconciled against `shopifyRawOrdersMap` on every `process` call.
 */
const printfulRawCostsMap = new Map<string, PrintfulRawCost[]>()

// ── Helpers ───────────────────────────────────────────────────────────────────

function post(msg: WorkerResponse, transfer: Transferable[] = []): void {
  ;(self as unknown as Worker).postMessage(msg, transfer)
}

/**
 * Builds a map of artist name → sorted, de-duplicated release titles by
 * iterating all raw transactions and expanding `original_artist` using
 * `extractFeaturedArtistsDetailed`.  Both the primary artist and every
 * featured artist are associated with the transaction's `release_title`,
 * so featuring artists who are not in the main roster still appear.
 *
 * @param transactions - All raw sales transactions (before any roster filter).
 * @returns Record mapping each artist (primary + featured) to their release titles.
 */
function buildReleaseTitlesByArtistIncFeaturing(
  transactions: SalesTransaction[]
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {}

  for (const tx of transactions) {
    const releaseTitle = tx.release_title
    if (!releaseTitle) continue
    if (!tx.original_artist) continue

    const { primary, featured } = extractFeaturedArtistsDetailed(tx.original_artist)
    const allArtists = primary ? [primary, ...featured] : featured

    for (const artist of allArtists) {
      const trimmed = artist.trim()
      if (!trimmed) continue
      if (!map[trimmed]) map[trimmed] = new Set<string>()
      map[trimmed].add(releaseTitle)
    }
  }

  const result: Record<string, string[]> = {}
  for (const [artist, titles] of Object.entries(map)) {
    result[artist] = Array.from(titles).sort((a, b) => a.localeCompare(b))
  }
  return result
}

function postParseDone(
  fileId: string,
  rowsParsed: number,
  rowsSkipped: number,
  uniqueArtistsCount: number,
  months: string[] = [],
  extra: { emptyCurrencyRows?: number; skipReasons?: string[] } = {},
): void {
  const bounds = periodBoundsFromMonths(months)
  post({
    type: 'parse-done',
    fileId,
    rowsParsed,
    rowsSkipped,
    uniqueArtistsCount,
    emptyCurrencyRows: extra.emptyCurrencyRows ?? 0,
    skipReasons: extra.skipReasons ?? [],
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
  })
}

function getAllTransactions(): SalesTransaction[] {
  const all: SalesTransaction[] = []
  for (const txs of fileTransactions.values()) {
    for (const t of txs) all.push(t)
  }

  // ── Reconcile e-commerce buffers ─────────────────────────────────────────
  // Collect all raw Shopify orders and Printful costs across all uploaded files.
  const allShopifyOrders: ShopifyRawOrder[] = []
  for (const orders of shopifyRawOrdersMap.values()) {
    for (const o of orders) allShopifyOrders.push(o)
  }

  if (allShopifyOrders.length > 0) {
    const allPrintfulCosts: PrintfulRawCost[] = []
    for (const costs of printfulRawCostsMap.values()) {
      for (const c of costs) allPrintfulCosts.push(c)
    }

    const { transactions: mergedTxs } = reconcileMerchTransactions(allShopifyOrders, allPrintfulCosts)
    for (const t of mergedTxs) all.push(t)
  }

  return all
}

function runProcess(config: WorkerProcessConfig): void {
  try {
    post({ type: 'process-progress', phase: 'aggregating', percentage: 8 })
    const allTransactions = getAllTransactions()

    if (allTransactions.length === 0) {
      lastProcessedArtistData = []
      post({
        type: 'result',
        data: {
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
        },
      })
      return
    }

    // Detect reporting period from all transactions.
    // Only keep values that match the normalised YYYY-MM format to prevent
    // placeholder strings like 'Unknown' or free-form date text (e.g. from
    // Darkmerch) from polluting the period bounds and triggering browser
    // warnings on <input type="month"> which requires exactly that format.
    const months = allTransactions
      .map(t => t.sales_month)
      .filter((m): m is string => typeof m === 'string' && VALID_MONTH_RE.test(m))
      .sort()
    const periodStart = months[0] ?? ''
    const periodEnd = months[months.length - 1] ?? ''

    // Compute total gross revenue across ALL records (before roster filter).
    // Physical transactions are excluded when `excludePhysical` is active so
    // both totals stay directly comparable.
    const workingAllTransactions = config.excludePhysical
      ? allTransactions.filter(t => !t.is_physical)
      : allTransactions
    const totalGrossAllData = workingAllTransactions.reduce(
      (sum, t) =>
        sum +
        normalizeRevenueToEur(
          t.net_revenue,
          t.currency,
          t.sales_month,
          config.exchangeRates ?? {},
          config.historicalExchangeRates ?? {},
        ),
      0,
    )

    post({ type: 'process-progress', phase: 'aggregating', percentage: 35 })
    // Core processing — financial math runs unchanged (no modifications to data-processor.ts)
    const { artistData, filteredCompilations } = processTransactionsWithCompilations(
      allTransactions,
      config
    )
    post({ type: 'process-progress', phase: 'summaries', percentage: 70 })
    // Pre-compute tree structures while we still have raw transactions in scope
    const artistTrees: ArtistTreeNode[] = buildArtistTree(artistData)
    const collabTransactions = config.excludePhysical
      ? allTransactions.filter(t => !t.is_physical)
      : allTransactions
    const collabTree: ArtistCollabNode[] = buildArtistCollabTree(collabTransactions, config.artistMappings)

    const uniqueArtists = artistData.map(d => d.artist).sort()

    lastProcessedArtistData = artistData

    // Strip raw transactions (which must never reach the main thread) by
    // destructuring them out and spreading the remaining safe fields.
    // TypeScript structural compatibility ensures SafeProcessedArtistData
    // receives every field from ProcessedArtistData except `transactions`.
    const processedData: SafeProcessedArtistData[] = artistData.map(({ transactions: _transactions, ...safe }) => safe)

    // Build the featuring-aware release-titles map while we still have all
    // raw transactions in scope (they must not be sent to the main thread).
    const releaseTitlesByArtistIncFeaturing = buildReleaseTitlesByArtistIncFeaturing(allTransactions)

    const territoryMetrics = aggregateTerritoryMetrics(
      artistData,
      config.exchangeRates,
      config.historicalExchangeRates,
    )

    const merchOrderRows = buildMerchOrderRows(allTransactions)

    // Raw transaction arrays and the full ProcessedArtistData (with .transactions)
    // are now only in local scope and will be garbage-collected once this
    // function returns — they are NEVER sent to the main thread.
    post({ type: 'process-progress', phase: 'finalizing', percentage: 92 })
    post({
      type: 'result',
      data: {
        processedData,
        artistTrees,
        collabTree,
        filteredCompilations,
        uniqueArtists,
        periodStart,
        periodEnd,
        totalGrossAllData,
        releaseTitlesByArtistIncFeaturing,
        territoryMetrics,
        merchOrderRows,
      },
    })
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown processing error',
    })
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data

  switch (msg.type) {
    case 'add-file': {
      const { fileId, content, source, customAliases } = msg
      try {
        if (source === 'shopify') {
          // Stage raw orders for reconciliation — do NOT convert to SalesTransactions yet.
          const { orders, errors } = parseShopifyRaw(content)
          shopifyRawOrdersMap.set(fileId, orders)
          postParseDone(fileId, orders.length, errors.length, 0)
        } else if (source === 'printful') {
          // Stage raw costs for reconciliation.
          const { costs, errors } = parsePrintfulCSV(content)
          printfulRawCostsMap.set(fileId, costs)
          postParseDone(fileId, costs.length, errors.length, 0)
        } else if (source === 'darkmerch') {
          const { transactions, errors } = parseDarkmerchCSV(content)
          fileTransactions.set(fileId, transactions)
          const uniqueArtists = [...new Set(transactions.map(t => t.original_artist).filter(Boolean))]
          postParseDone(
            fileId,
            transactions.length,
            errors.length,
            uniqueArtists.length,
            transactions.map((tx) => tx.sales_month),
          )
        } else {
          const result = await parseCSVContentStreaming(
            content,
            source,
            (progress) => {
              post({
                type: 'parse-progress',
                fileId,
                percentage: progress.percentage,
                phase: progress.phase,
                processedRows: progress.processedRows,
                totalRows: progress.totalRows,
              })
            },
            undefined,
            customAliases
          )
          fileTransactions.set(fileId, result.transactions)
          postParseDone(
            fileId,
            result.transactions.length,
            result.errors.length + result.skipped.length,
            result.uniqueArtists.length,
            result.transactions.map((tx) => tx.sales_month),
            {
              emptyCurrencyRows: result.emptyCurrencyRows,
              skipReasons: [...new Set(result.skipped.map((skip) => skip.reason))],
            },
          )
        }
      } catch (err) {
        post({
          type: 'error',
          fileId,
          message: err instanceof Error ? err.message : 'Unknown parse error',
        })
      }
      break
    }

    case 'remove-file': {
      fileTransactions.delete(msg.fileId)
      shopifyRawOrdersMap.delete(msg.fileId)
      printfulRawCostsMap.delete(msg.fileId)
      break
    }

    case 'process': {
      runProcess(msg.config)
      break
    }

    case 'reset': {
      fileTransactions.clear()
      shopifyRawOrdersMap.clear()
      printfulRawCostsMap.clear()
      lastProcessedArtistData = []
      break
    }

    case 'build-excel': {
      try {
        post({ type: 'excel-progress', requestId: msg.requestId, phase: 'original-reports' })
        const match = lastProcessedArtistData.find(
          (row) => normalizeArtistNameKey(row.artist) === normalizeArtistNameKey(msg.artist),
        )
        const sheets = match
          ? (buildArtistRawSheets([match]).get(normalizeArtistNameKey(match.artist)) ?? [])
          : []
        const excelSettings = normalizeExcelExportSettings(
          msg.settings && ('sheets' in msg.settings || 'columns' in msg.settings)
            ? msg.settings
            : {},
        )
        const wantRaw = isExcelSheetEnabled(excelSettings, 'raw')
        if (wantRaw) {
          const missing = missingOriginalReportSources(msg.artistData, sheets)
          if (missing.length > 0) {
            post({
              type: 'excel-error',
              requestId: msg.requestId,
              message: `Missing original-report tabs: ${missing.join(', ')}`,
            })
            break
          }
        }
        const rawRowCount = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
        post({
          type: 'excel-progress',
          requestId: msg.requestId,
          phase: 'original-reports',
          rows: rawRowCount,
        })
        const xlsx = await generateExcel(
          msg.artistData,
          msg.labelInfo,
          msg.periodStart,
          msg.periodEnd,
          msg.compilationFilters,
          msg.settings,
          wantRaw ? sheets : [],
          (progress) => {
            post({
              type: 'excel-progress',
              requestId: msg.requestId,
              phase: 'original-reports',
              rows: progress.written,
            })
          },
        )
        const buffer = await xlsx.arrayBuffer()
        post({ type: 'excel-done', requestId: msg.requestId, buffer, kind: 'xlsx' }, [buffer])
      } catch (err) {
        console.error('[sos-worker] build-excel failed:', err)
        post({
          type: 'excel-error',
          requestId: msg.requestId,
          message: err instanceof Error ? err.message : 'Excel generation failed',
        })
      }
      break
    }
  }
})
