/** An artist signed to the label roster. */
export interface LabelArtist {
  id: string
  name: string
  /** Contact e-mail address for sending statements. */
  email?: string
  /** VAT identification number (EU artists outside Germany). */
  vatNumber?: string
  /** Free-text notes, special contract terms, or other label-internal remarks. */
  notes?: string
  /** When true, EU reverse-charge rules apply (no German VAT on invoice). */
  isEuNonGerman?: boolean
  /**
   * Per-artist VAT rate as an integer percentage, e.g. 19 for 19 % MwSt.
   * Overrides the global labelInfo.vatRate when set.
   * Set to 0 when the artist is not VAT-liable (e.g. Kleinunternehmer).
   */
  vatRate?: number
  /** Legal account holder name as it appears on the bank account. */
  accountHolder?: string
  /**
   * International Bank Account Number (IBAN) for SEPA credit transfers.
   * Stored without spaces in uppercase, e.g. "DE89370400440532013000".
   */
  iban?: string
  /**
   * Bank Identifier Code (BIC / SWIFT code) for the artist's bank.
   * Optional since SEPA transactions within the EU/EEA no longer require
   * a BIC when both accounts are in SEPA countries (IBAN-only since 2016).
   */
  bic?: string
  /**
   * UUID of the corresponding artist record in the darkTunes portal database
   * (darktunes-website.artists table). Required for automatic statement uploads
   * via the portal webhook integration.
   */
  artistId?: string
}

/**
 * A recoupable expense entry that is deducted from an artist's gross revenue
 * before the split percentage is applied.
 */
export interface ExpenseEntry {
  id: string
  /** Artist name this expense is attributed to. */
  artist: string
  /** Short description, e.g. "Musikvideo-Produktion" or "PR-Agentur Q3". */
  description: string
  /** Expense amount in EUR (positive number = deducted from revenue). */
  amount: number
  /** ISO 8601 date string of when the expense was incurred. */
  date: string
}

/**
 * An entry (artist + optional release) that has been explicitly ignored in the
 * statement of sales. Ignored entries are excluded from all revenue calculations.
 */
export interface IgnoredEntry {
  id: string
  /** Artist name as it appears in the processed data. */
  artist: string
  /**
   * Optional release title. When set, only that release is ignored for the artist.
   * When omitted, ALL transactions for the artist are ignored.
   */
  releaseTitle?: string
  /** Human-readable note for why this entry was ignored. */
  note?: string
  /** ISO 8601 timestamp when the entry was created. */
  createdAt: string
}

/** A single Shopify order line item mapped to a sales transaction. */
export interface ShopifySale {
  id: string
  orderId: string
  orderDate: string
  productTitle: string
  sku: string
  quantity: number
  grossRevenue: number
  currency: string
  netRevenue: number
}

/** Upload metadata persisted in IndexedDB; raw CSV content stays in memory only. */
export interface UploadedFile {
  id: string
  name: string
  size: number
  type: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'
  /** Raw CSV string — kept in memory only, NOT persisted to IndexedDB. */
  data?: string
  /** ISO 8601 timestamp string (YYYY-MM-DDTHH:mm:ss.sssZ) */
  uploadedAt: string
  /** Number of successfully parsed data rows. */
  rowsParsed?: number
  /** Number of rows skipped due to parse errors. */
  rowsSkipped?: number
  /** Number of unique artists found. */
  uniqueArtistsCount?: number
  /** Bronze import batch ID when raw CSV was archived in R2. */
  bronzeBatchId?: string
}

/** Transient per-file processing state (not persisted). */
export type FileStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export interface FileProcessingState {
  status: FileStatus
  progress: number
  error?: string
  /** Bronze R2 archive status (non-blocking side upload). */
  bronzeStatus?: 'uploading' | 'done' | 'error' | 'skipped'
}

export interface CompilationFilter {
  id: string
  identifier: string
  type: 'ean' | 'title' | 'catalog'
  label: string
}

export interface ArtistMapping {
  id: string
  featuringName: string
  primaryArtist: string
  /** Set to true when this mapping was created by the Jaro-Winkler auto-resolver. */
  autoMapped?: boolean
  /** Jaro-Winkler similarity score (0–1) for auto-mapped entries. */
  mappingScore?: number
}

/**
 * A per-release split percentage override for a specific artist.
 * Matched case-insensitively as a substring of the release title.
 * When matched, this percentage overrides the artist's base, digital,
 * or physical split percentage for that release's transactions.
 */
export interface ReleaseSplitOverride {
  /** Substring of the release title (case-insensitive match). */
  releaseTitle: string
  /** Digital split percentage (0–100) for matching transactions. */
  percentage: number
  /**
   * Optional physical split percentage (0–100) for matching transactions.
   * When omitted, `percentage` is used for physical revenue as well.
   */
  physicalPercentage?: number
}

/** Canonical data source identifier for SalesTransaction.source. */
export type TransactionSource = 'believe' | 'bandcamp' | 'darkmerch' | 'shopify' | 'printful'

/**
 * A per-source split override that takes highest priority in the resolution chain.
 *
 * Use cases:
 * - Darkmerch: set 100% so the artist keeps all merchandise revenue.
 * - Shopify/Printful: set a dedicated merch rate distinct from pressed CDs.
 * - Believe: can still use digitalPercentage/physicalPercentage since Believe
 *   transactions are already split by is_physical.
 */
export interface SourceSplitOverride {
  /** The data source this override applies to. */
  source: TransactionSource
  /** Split percentage (0–100) applied to all transactions from this source. */
  percentage: number
}

export interface SplitFee {
  artist: string
  /** Default split percentage (0–100) applied to all revenue types. */
  percentage: number
  /**
   * Optional override split percentage (0–100) applied exclusively to digital
   * (streaming) revenue. When set, overrides `percentage` for digital revenue.
   * When omitted, `percentage` is used for digital revenue instead.
   */
  digitalPercentage?: number
  /**
   * Optional override split percentage (0–100) applied exclusively to physical
   * and merch revenue. When set, overrides `percentage` for physical revenue.
   * When omitted, `percentage` is used for physical revenue instead.
   */
  physicalPercentage?: number
  /**
   * Optional per-release split overrides. Each entry targets transactions
   * whose release title contains `releaseTitle` (case-insensitive substring).
   * When a match is found, `percentage` overrides the type-level split.
   * Evaluated after digital/physical type overrides — release overrides
   * take the highest precedence.
   */
  releaseOverrides?: ReleaseSplitOverride[]
  /**
   * Optional per-source split overrides. Evaluated with HIGHEST priority —
   * before digitalPercentage/physicalPercentage type overrides and before
   * release overrides when a release override is NOT also matched.
   *
   * Resolution priority (highest → lowest):
   *   1. Release override (when matched)
   *   2. Per-source override (sourceOverrides)
   *   3. Per-type override (digitalPercentage / physicalPercentage)
   *   4. Per-artist base (percentage)
   *   5. Label-wide defaults
   */
  sourceOverrides?: SourceSplitOverride[]
}

export interface ManualRevenue {
  id: string
  artist: string
  description: string
  amount: number
}

export interface LabelInfo {
  name: string
  address: string
  /** Legacy logo field (data URL) — used by PDF generation. */
  logo?: string
  /** Base64-encoded logo image used for display and export. Kept in sync with logo. */
  logoBase64?: string
  /** Steuernummer (domestic German tax number, e.g. "123/456/78901"). */
  taxNumber?: string
  /** Umsatzsteuer-Identifikationsnummer (EU VAT ID, e.g. "DE123456789"). */
  taxId?: string
  /** Rechtsform und Geschäftsführer, e.g. "GmbH · Geschäftsführer: Max Mustermann". */
  legalForm?: string
  /** Kontakt-E-Mail-Adresse des Labels. */
  email?: string
  /** Bankverbindung im Freitext, z.B. "IBAN: DE89… · BIC: DEUTDEDB". */
  bankAccount?: string
  /**
   * Structured IBAN for the label's own bank account used as the SEPA debitor
   * account (`<DbtrAcct>`) when generating batch payment XML files.
   * Stored without spaces in uppercase, e.g. "DE89370400440532013000".
   */
  sepaIban?: string
  /**
   * Legal name of the label as registered with its bank — used as `<Dbtr><Nm>`
   * in SEPA XML exports. Must exactly match the bank account holder name.
   */
  sepaAccountHolder?: string
  /** Rechtlicher Hinweistext für die Fußzeile von Abrechnungen. */
  footerText?: string
  /**
   * VAT rate as an integer percentage applied to all artist payouts, e.g. 19 for 19 % MwSt.
   * Set to 0 (or leave undefined) when the label is not VAT-liable.
   */
  vatRate?: number
  /**
   * Prefix used when generating invoice numbers, e.g. "SOS-2025".
   * Each statement gets a unique suffix appended (artist index or name).
   */
  invoiceNumberPrefix?: string
  /**
   * E-mail body template used when sending statement e-mails to artists.
   * Supports the following placeholders: {artist}, {period}, {amount},
   * {label_name}, {label_vat_id}, {invoice_email}, {deadline_date}.
   */
  emailTemplate?: string
}

/**
 * Application-wide defaults that apply to all new statements.
 * Stored separately from LabelInfo to keep concerns clean.
 */
export interface AppDefaults {
  /** Default artist split rate in percent (0–100). Applied when no per-artist rule exists. */
  defaultSplitPercentage: number
  /**
   * Optional override default split percentage (0–100) applied exclusively to digital
   * (streaming) revenue. When set, overrides `defaultSplitPercentage` for digital revenue
   * on artists that have no per-artist digital split override. When omitted,
   * `defaultSplitPercentage` is used for digital revenue.
   */
  defaultSplitPercentageDigital?: number
  /**
   * Optional override default split percentage (0–100) applied exclusively to physical
   * and merch revenue. When set, overrides `defaultSplitPercentage` for physical revenue
   * on artists that have no per-artist physical split override. When omitted,
   * `defaultSplitPercentage` is used for physical revenue.
   */
  defaultSplitPercentagePhysical?: number
  /** Number of days after statement delivery within which an invoice must be received. */
  invoiceDeadlineDays: number
  /** E-mail address to which artists must send their invoice. */
  financeEmail: string
  /** Human-readable deadline date shown in e-mail templates, e.g. "December 20th". */
  invoiceDeadlineDate: string
  /** Organisation name that receives unclaimed royalties, e.g. "animal shelter". */
  royaltyDonationOrg: string
  /**
   * Label distribution fee as a percentage (0–100) deducted from each artist's
   * gross streaming/physical revenue before the individual split is applied.
   * Defaults to 0 (no distribution fee).
   */
  distributionFeePercentage: number
  /**
   * Optional override distribution fee (0–100) applied exclusively to digital
   * (streaming) revenue. When set, overrides `distributionFeePercentage` for
   * digital revenue. When omitted, `distributionFeePercentage` is used.
   */
  distributionFeeDigital?: number
  /**
   * Optional override distribution fee (0–100) applied exclusively to physical
   * and merch revenue. When set, overrides `distributionFeePercentage` for
   * physical revenue. When omitted, `distributionFeePercentage` is used.
   */
  distributionFeePhysical?: number
  /**
   * Bucket-specific split rates (0–100) — a completely independent, parallel system to the
   * main per-artist split chain.
   *
   * A bucket split activates **only when the value is explicitly set** (`!= null`).
   * When active, it bypasses the main chain entirely for that revenue bucket:
   * the per-artist base percentage and digital/physical type percentages do NOT apply.
   * The ONLY override for an active bucket split is an explicit per-artist `sourceOverrides`
   * entry for that specific source.
   *
   * When a bucket split is **not** set (field absent / undefined), the bucket falls through
   * to the normal main chain (globalBase → globalType → perArtistBase → perArtistType → perRelease).
   *
   * - `believe`   – Believe digital streaming / download revenue
   * - `bandcamp`  – Bandcamp sales
   * - `darkmerch` – Darkmerch merchandise revenue
   * - `physical`  – Physical releases (Shopify / Printful)
   */
  sourceSplits?: {
    believe?: number
    bandcamp?: number
    darkmerch?: number
    physical?: number
  }
}

/**
 * Configuration for which sections are rendered in exported PDF statements.
 * All flags default to true for backward-compatibility.
 */
export interface PdfExportSettings {
  /** Include the release / album breakdown table. */
  includeReleaseBreakdown: boolean
  /** Include the streaming platform breakdown table. */
  includePlatformBreakdown: boolean
  /** Include the country / territory breakdown table. */
  includeCountryBreakdown: boolean
  /** Include the monthly revenue trend table. */
  includeMonthlyBreakdown: boolean
  /** Prepend the e-mail cover letter (rendered from emailTemplate) as the first page. */
  includeEmailCoverLetter: boolean
  /**
   * When true (default), compilation releases are excluded from the release
   * breakdown table in exported PDF and Excel statements.
   * Compilation releases are identified by matching any active CompilationFilter.
   * Defaults to true (compilations hidden).
   */
  hideCompilationsInStatement: boolean
  /**
   * When true, a pie chart is appended to the statement showing each revenue
   * category's share of the total gross revenue.
   */
  includePieChart?: boolean
  /**
   * Maximum number of countries to show in the country breakdown table.
   * Countries are sorted by revenue descending; only the top N are shown.
   * When more countries exist, a footnote "(+ N more countries not shown)" is
   * appended to the table. Defaults to 15.
   */
  topCountriesCount?: number
}

/**
 * E-mail service configuration.  Passwords are intentionally excluded — they
 * must never be stored in the browser.  The config is used to pre-fill the
 * mailto: link or display SMTP settings for external clients.
 */
export interface EmailConfig {
  /** Display name shown in the From field, e.g. "darkTunes Music Group". */
  fromName: string
  /** Sender address, e.g. "finance@label.com". */
  fromEmail: string
  /** Reply-to address (often the same as fromEmail). */
  replyTo: string
  /** Optional subject template. Placeholders: {artist}, {period}. */
  subjectTemplate: string
}

/**
 * One co-owner's contractual share of a specific release's gross revenue.
 * Applied before any label distribution fee or artist split percentage.
 */
export interface RevenueOwner {
  /** Canonical artist name (must match roster or CSV artist name). */
  artist: string
  /**
   * Ownership share as a percentage (0–100).
   * Invariant: sum of all owners in a TrackRevenueAssignment must equal 100.
   */
  percentage: number
}

/**
 * A rule that assigns revenue from a specific track/release to one or more
 * owner artists, regardless of the artist name stored in the CSV.
 *
 * Matching is a case-insensitive substring check against both `release_title`
 * and `track_title` of every transaction.  When a match is found the
 * transaction is re-attributed — exclusively to the single ownerArtist (legacy)
 * or split proportionally among multiple owners (new) — before any roster
 * filtering or grouping happens.
 */
export interface TrackRevenueAssignment {
  id: string
  /**
   * Substring of the release or track title to match (case-insensitive).
   * The first matching rule wins.
   */
  trackTitle: string
  /**
   * @deprecated Use `owners` for new rules. Kept for backward-compatibility
   * with existing workspace backups that pre-date multi-owner support.
   * When `owners` is present and non-empty, this field is ignored.
   */
  ownerArtist?: string
  /**
   * Proportional revenue distribution among co-owner artists.
   * When set, each matching transaction is cloned and scaled per owner
   * before any label split or expense calculation runs.
   *
   * When absent, falls back to `ownerArtist` at 100% (legacy behaviour).
   *
   * Invariant: sum(owners[*].percentage) === 100.
   */
  owners?: RevenueOwner[]
}

/** Contractual payout share assigned to a guest / featured artist. */
export interface GuestPayoutRule {
  primaryArtist: string
  guestName: string
  /** Percentage of the collab-track revenue that the guest receives (0–100). */
  percentage: number
}

/** Revenue aggregated by streaming/download platform. */
export interface PlatformRevenue {
  platform: string
  revenue: number
  quantity: number
  /** Number of units that were digital downloads (undefined when not distinguishable). */
  downloadQuantity?: number
  /** Number of units that were streams (undefined when not distinguishable). */
  streamQuantity?: number
}

/** Revenue aggregated by territory/country. */
export interface CountryRevenue {
  country: string
  revenue: number
  quantity: number
}

/** Revenue aggregated by calendar month (YYYY-MM). */
export interface MonthlyRevenue {
  month: string
  revenue: number
}

/** Revenue aggregated by release (album / single). */
export interface ReleaseRevenue {
  releaseTitle: string
  upcEan: string
  catalogNumber: string
  revenue: number
  quantity: number
  isPhysical: boolean
}

/** Compilation release that was filtered out, with its accumulated revenue. */
export interface FilteredCompilation {
  releaseTitle: string
  identifier: string
  filterType: 'ean' | 'title' | 'catalog'
  revenue: number
  transactionCount: number
}

export interface ArtistRevenue {
  artist: string
  believeRevenue: number
  bandcampRevenue: number
  /** EUR revenue from Darkmerch-sourced rows. */
  darkmerchRevenue: number
  manualRevenue: number
  totalRevenue: number
  splitPercentage: number
  finalAmount: number
  openingBalanceEur?: number
  amountDueEur?: number
  totalQuantity: number
  /** Total recoupable expenses deducted from gross revenue before split. */
  totalExpenses: number
  /** Distribution fee amount deducted before the artist split was applied. */
  distributionFeeDeducted: number
  /** EUR revenue from streaming transactions (subset of digital). */
  totalStreamRevenue: number
  /** EUR revenue from digital download transactions (subset of digital). */
  totalDownloadRevenue: number
  platformBreakdown: PlatformRevenue[]
  countryBreakdown: CountryRevenue[]
  monthlyBreakdown: MonthlyRevenue[]
  releaseBreakdown: ReleaseRevenue[]
  /** Revenue from physical releases (Believe physical, Bandcamp physical) — excludes Darkmerch. */
  physicalReleasesRevenue: number
  /** Split percentage (0–100) actually applied to digital (streaming/download) revenue. */
  digitalSplitPercentage: number
  /** Split percentage (0–100) actually applied to physical releases revenue. */
  physicalSplitPercentage: number
  /** Split percentage (0–100) actually applied to Darkmerch/merchandise revenue. */
  darkmerchSplitPercentage: number
}

// ── History ────────────────────────────────────────────────────────────────────

/** One upload event recorded in KV for the history panel. */
export interface HistoryEntry {
  id: string
  /** ISO 8601 timestamp */
  timestamp: string
  filename: string
  source: 'believe' | 'bandcamp' | 'shopify' | 'printful' | 'darkmerch'
  sizeBytes: number
  rowsParsed: number
  rowsSkipped: number
  uniqueArtists: number
  /** ISO 8601 timestamp the file was removed, if applicable */
  removedAt?: string
}

// ── CSV column customisation ───────────────────────────────────────────────────

/**
 * User-defined additional synonym for a semantic CSV field.
 * These are merged with the built-in semanticDictionary at parse time.
 */
export interface CSVColumnAlias {
  id: string
  fieldName: string
  synonym: string
}

// ── Dashboard filter / sort state ─────────────────────────────────────────────

export type DashboardSortField =
  | 'artist'
  | 'believeRevenue'
  | 'bandcampRevenue'
  | 'totalRevenue'
  | 'finalAmount'
  | 'totalQuantity'
  | 'splitPercentage'

export type SortDirection = 'asc' | 'desc'

export interface DashboardFilter {
  searchQuery: string
  minRevenue: number
  maxRevenue: number
  sortField: DashboardSortField
  sortDirection: SortDirection
}

// ── Track-level data (for tree view) ──────────────────────────────────────────

export interface TrackData {
  trackTitle: string
  isrc: string
  revenue: number
  quantity: number
  platforms: string[]
}

export interface ReleaseWithTracks {
  releaseTitle: string
  upcEan: string
  catalogNumber: string
  isPhysical: boolean
  revenue: number
  quantity: number
  tracks: TrackData[]
}

export interface ArtistTreeNode {
  artist: string
  totalRevenue: number
  finalPayout: number
  splitPercentage: number
  quantity: number
  releases: ReleaseWithTracks[]
}

// ── Grouping / filtering ───────────────────────────────────────────────────────

export type GroupByField = 'artist' | 'album' | 'song' | 'platform' | 'country' | 'month'

export interface GroupNode {
  key: string
  label: string
  revenue: number
  quantity: number
  transactionCount: number
  children?: GroupNode[]
}

export interface FilterState {
  searchQuery: string
  selectedPlatforms: string[]
  selectedCountries: string[]
  selectedSources: ('believe' | 'bandcamp' | 'manual' | 'shopify' | 'darkmerch')[]
  minRevenue: number
  maxRevenue: number
  dateFrom: string
  dateTo: string
}

export interface ArtistCollabNode {
  primaryArtist: string
  revenue: number
  quantity: number
  collabEntries: Array<{
    name: string
    revenue: number
    quantity: number
  }>
}

/**
 * Worker-safe version of ProcessedArtistData.
 *
 * Raw `SalesTransaction[]` rows are intentionally omitted so they can be
 * discarded inside the Web Worker after aggregation.  The two revenue split
 * fields (believeRevenue / bandcampRevenue) are pre-computed by the worker
 * before the transaction array is dropped.
 *
 * All other fields are fully serialisable and can be safely transferred via
 * postMessage without triggering memory issues on the main thread.
 */
export interface SafeProcessedArtistData {
  artist: string
  /** Revenue from Believe-sourced rows (pre-computed in worker). */
  believeRevenue: number
  /** Revenue from Bandcamp-sourced rows (pre-computed in worker). */
  bandcampRevenue: number
  /** Revenue from Darkmerch-sourced rows (pre-computed in worker). */
  darkmerchRevenue: number
  totalDigitalRevenue: number
  totalPhysicalRevenue: number
  /** Total digital downloads revenue (subset of totalDigitalRevenue). */
  totalDownloadRevenue: number
  /** Total streaming revenue (subset of totalDigitalRevenue). */
  totalStreamRevenue: number
  manualRevenue: number
  /** Individual manual revenue entries with description and amount. */
  manualRevenueEntries: Array<{ description: string; amount: number }>
  grossRevenue: number
  splitPercentage: number
  finalPayout: number
  /** Opening brought into this period (not included in finalPayout). */
  openingBalanceEur: number
  /** finalPayout + openingBalanceEur. */
  amountDueEur: number
  totalQuantity: number
  /** Total recoupable expenses deducted from gross revenue before split. */
  totalExpenses: number
  /** Individual expense entries that make up totalExpenses. */
  expenseEntries: Array<{ description: string; amount: number; date: string }>
  /** Label distribution fee (EUR) deducted from streaming/physical revenue before split. */
  distributionFeeDeducted: number
  platformBreakdown: PlatformRevenue[]
  countryBreakdown: CountryRevenue[]
  monthlyBreakdown: MonthlyRevenue[]
  releaseBreakdown: ReleaseRevenue[]
  /** Revenue from physical releases (excl. Darkmerch). */
  physicalReleasesRevenue: number
  /** Digital revenue after label distribution fee deduction (split basis for digital). */
  digitalRevenueAfterFee: number
  /** Believe digital revenue after label distribution fee deduction. */
  believeDigitalRevenueAfterFee: number
  /** Bandcamp digital revenue after label distribution fee deduction. */
  bandcampDigitalRevenueAfterFee: number
  /** Other digital revenue (not Believe, not Bandcamp) after label distribution fee deduction. */
  otherDigitalRevenueAfterFee: number
  /** Physical releases revenue after label distribution fee deduction. */
  physicalReleasesRevenueAfterFee: number
  /** Darkmerch revenue after label distribution fee deduction. */
  darkmerchRevenueAfterFee: number
  /** Split percentage (0–100) actually applied to digital (streaming/download) revenue (representative fallback for display). */
  digitalSplitPercentage: number
  /** Split percentage (0–100) actually applied to Believe digital revenue. */
  believeSplitPercentage: number
  /** Split percentage (0–100) actually applied to Bandcamp revenue. */
  bandcampSplitPercentage: number
  /** Split percentage (0–100) actually applied to physical releases revenue. */
  physicalSplitPercentage: number
  /** Split percentage (0–100) actually applied to Darkmerch/merchandise revenue. */
  darkmerchSplitPercentage: number
}
