import type { SalesTransaction } from '../ingest/csv-parser'
import type {
  CompilationFilter,
  ArtistMapping,
  SplitFee,
  ManualRevenue,
  ExpenseEntry,
  PlatformRevenue,
  CountryRevenue,
  MonthlyRevenue,
  ReleaseRevenue,
  FilteredCompilation,
  LabelArtist,
  IgnoredEntry,
  TrackRevenueAssignment,
} from '../types'
import type { ExchangeRates, HistoricalRates } from '../currency'

export interface ProcessedArtistData {
  artist: string
  transactions: SalesTransaction[]
  believeRevenue: number
  bandcampRevenue: number
  darkmerchRevenue: number
  totalDigitalRevenue: number
  totalPhysicalRevenue: number
  totalDownloadRevenue: number
  totalStreamRevenue: number
  manualRevenue: number
  manualRevenueEntries: Array<{ description: string; amount: number }>
  grossRevenue: number
  splitPercentage: number
  /** Period activity only — does not include opening / carry-forward. */
  finalPayout: number
  /** Opening brought into this period (display / amount due only). */
  openingBalanceEur: number
  /** finalPayout + openingBalanceEur. */
  amountDueEur: number
  totalQuantity: number
  totalExpenses: number
  expenseEntries: Array<{ description: string; amount: number; date: string }>
  distributionFeeDeducted: number
  platformBreakdown: PlatformRevenue[]
  countryBreakdown: CountryRevenue[]
  monthlyBreakdown: MonthlyRevenue[]
  releaseBreakdown: ReleaseRevenue[]
  physicalReleasesRevenue: number
  digitalRevenueAfterFee: number
  believeDigitalRevenueAfterFee: number
  bandcampDigitalRevenueAfterFee: number
  otherDigitalRevenueAfterFee: number
  physicalReleasesRevenueAfterFee: number
  darkmerchRevenueAfterFee: number
  digitalSplitPercentage: number
  believeSplitPercentage: number
  bandcampSplitPercentage: number
  physicalSplitPercentage: number
  darkmerchSplitPercentage: number
}

export interface DataProcessorConfig {
  compilationFilters: CompilationFilter[]
  artistMappings: ArtistMapping[]
  splitFees: SplitFee[]
  manualRevenues: ManualRevenue[]
  expenses?: ExpenseEntry[]
  excludePhysical?: boolean
  exchangeRates?: ExchangeRates
  historicalExchangeRates?: HistoricalRates
  labelArtists?: LabelArtist[]
  ignoredEntries?: IgnoredEntry[]
  trackRevenueAssignments?: TrackRevenueAssignment[]
  carryForwardByArtist?: Record<string, number>
  distributionFeePercentage?: number
  distributionFeeDigital?: number
  distributionFeePhysical?: number
  defaultSplitPercentage?: number
  defaultSplitPercentageDigital?: number
  defaultSplitPercentagePhysical?: number
  sourceSplits?: {
    believe?: number
    bandcamp?: number
    darkmerch?: number
    physical?: number
  }
}

export interface ProcessorResult {
  artistData: ProcessedArtistData[]
  filteredCompilations: FilteredCompilation[]
}

/** Serializable territory fact produced before raw transactions are discarded. */
export interface TerritoryMetricRow {
  artistName: string
  period: string
  platform: string
  country: string
  streams: number
  revenueEur: number
  quantity: number
}