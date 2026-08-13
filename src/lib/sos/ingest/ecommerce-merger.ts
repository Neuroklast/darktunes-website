/**
 * ecommerce-merger.ts
 *
 * Pure functions for reconciling Shopify order data with Printful production
 * costs and intelligently mapping sold merchandise to the correct artist.
 *
 * ## Data flow
 * 1. `parseShopifyRaw`   → `ShopifyRawOrder[]`   (shopify-parser.ts)
 * 2. `parsePrintfulCSV`  → `PrintfulRawCost[]`   (printful-parser.ts)
 * 3. `reconcileMerchTransactions(orders, costs)` → `SalesTransaction[]`
 *
 * ## Artist extraction from product names
 * Shopify line items follow one of two naming conventions:
 *
 *   a) `ARTIST - Release Title`             (digital / catalogue products)
 *   b) `Product Type - ARTIST - Design - Variant` (apparel / merch)
 *
 * The function `extractArtistFromLineItem` detects which convention applies
 * based on a curated set of physical product type prefixes, then returns the
 * artist name segment. Items without a recognisable artist (e.g. "Tip",
 * "Gift Card") return `null` and are attributed to a synthetic label-revenue
 * bucket so they do not pollute the artist roster.
 *
 * ## Proportional cost distribution
 * A single Printful production cost covers an entire order which may contain
 * items belonging to several artists. The cost is distributed proportionally
 * by each line item's revenue share within the order:
 *
 *   line_net = (lineitem_price × qty / Σ all lineitem revenues) × (subtotal − printful_cost)
 *
 * This ensures every artist bears a fair share of the fulfilment cost.
 */

import Papa from 'papaparse'
import type { SalesTransaction } from './csv-parser'
import { normalizeDateToMonth } from './streaming-csv-parser'

// ── Domain types ──────────────────────────────────────────────────────────────

/** A single line item within a Shopify order (one row in the CSV). */
export interface ShopifyRawLineItem {
  /** Product name exactly as exported by Shopify, e.g. "T-shirt - BLACKBOOK - Different (bundle) - XL". */
  lineItemName: string
  /** SKU code, used as catalog reference. */
  sku: string
  /** Number of units ordered. */
  quantity: number
  /** Per-unit selling price in the order currency. */
  unitPrice: number
}

/**
 * A Shopify order, normalised from potentially multiple CSV rows (one per line
 * item). Only the first CSV row for each order carries order-level fields
 * (Subtotal, Paid at, Billing Country, etc.); subsequent rows hold only line
 * item data.
 */
export interface ShopifyRawOrder {
  /** Order name / number as shown in Shopify, e.g. "#DM1121". */
  orderId: string
  /** ISO-formatted sales month, e.g. "2026-02". */
  salesMonth: string
  /**
   * Order-level subtotal (products only, before shipping and taxes).
   * Used as the gross revenue base for net calculation.
   */
  subtotal: number
  /** ISO 4217 currency code, e.g. "EUR". */
  currency: string
  /** Billing country code, e.g. "DE". */
  country: string
  /** All line items in the order. */
  lineItems: ShopifyRawLineItem[]
}

/**
 * A single Printful production-cost entry (one row per order in the Printful
 * orders export).
 */
export interface PrintfulRawCost {
  /** Order identifier, e.g. "#DM1063". Must be normalised before matching. */
  orderId: string
  /** Total production + shipping cost charged by Printful. */
  total: number
}

/** Structured warning emitted when a Shopify order has no matching Printful cost. */
export interface ReconciliationWarning {
  orderId: string
  reason: 'no-printful-match'
  vendor: string
  subtotal: number
}

export interface MerchReconciliationResult {
  transactions: SalesTransaction[]
  warnings: ReconciliationWarning[]
}

// ── Artist extraction constants ───────────────────────────────────────────────

/**
 * Physical product type prefixes (all lower-case).
 *
 * When a line item name starts with one of these tokens, the naming convention
 * is `[Product Type] - [Artist] - [Design] - [Variant]`, so the artist name
 * is in segment 1 (0-indexed).
 *
 * Rule of thumb: add a prefix here only when it is a tangible merchandise
 * category, never an artist or label name.
 */
const PHYSICAL_PRODUCT_PREFIXES: ReadonlySet<string> = new Set([
  't-shirt',
  'shirt',
  'girly shirt',
  'girly-shirt',
  'hoodie',
  'zipper',
  'zip hoodie',
  'sweater',
  'sweatshirt',
  'pullover',
  'jacket',
  'vest',
  'beanie',
  'cap',
  'hat',
  'mug',
  'cup',
  'bag',
  'tote',
  'tote bag',
  'backpack',
  'poster',
  'canvas',
  'print',
  'sticker',
  'patch',
  'pin',
  'button',
  'badge',
  'wristband',
  'scarf',
  'socks',
  'phone case',
  'notebook',
  'bundle',
])

/**
 * Item names that represent label-level or meta revenue rather than an
 * artist-specific product. These are attributed to the synthetic
 * "Label Revenue" bucket.
 */
const LABEL_REVENUE_KEYWORDS: ReadonlySet<string> = new Set([
  'tip',
  'gift card',
  'giftcard',
  'gift voucher',
  'voucher',
  'shipping',
  'shipping protection',
  'donation',
  'discount',
])

/** Label displayed in the dashboard for orders where no artist can be extracted. */
export const LABEL_REVENUE_ARTIST = 'Label Revenue (Merch)'

// ── Artist extraction ─────────────────────────────────────────────────────────

/**
 * Extracts the artist name from a Shopify line item product name.
 *
 * **Conventions handled:**
 * - `ARTIST - Release Title [- Variant]`
 *   → returns `"ARTIST"` (first segment is the artist name)
 * - `Product Type - ARTIST - Design [- Variant]`
 *   → returns `"ARTIST"` (second segment, because first is a known type prefix)
 * - `Tip`, `Gift Card`, etc.
 *   → returns `null`  (label revenue, no artist)
 *
 * The comparison is case-insensitive. Trailing/leading whitespace is trimmed.
 *
 * @param lineItemName - The raw "Lineitem name" value from the Shopify CSV.
 * @returns The extracted artist name, or `null` if no artist can be determined.
 */
export function extractArtistFromLineItem(lineItemName: string): string | null {
  const name = lineItemName.trim()
  if (!name) return null

  // Check for known label-revenue items first (whole-string match, lower-case)
  if (LABEL_REVENUE_KEYWORDS.has(name.toLowerCase())) return null

  const parts = name.split(' - ')

  // Single-segment name with no dash separator → cannot determine artist
  if (parts.length < 2) return null

  const firstSegment = parts[0].trim()
  const firstSegmentLower = firstSegment.toLowerCase()

  // Determine whether the first segment is a product type prefix
  const isProductTypePrefix = PHYSICAL_PRODUCT_PREFIXES.has(firstSegmentLower)

  if (isProductTypePrefix) {
    // Convention: "Product Type - ARTIST - ..."
    const artist = parts[1]?.trim()
    return artist || null
  }

  // Default convention: "ARTIST - Release Title - ..."
  return firstSegment || null
}

/**
 * Extracts the release / product title from a Shopify line item name,
 * removing the leading product-type prefix and artist segment.
 *
 * @param lineItemName - The raw "Lineitem name" value.
 * @returns A cleaned release title suitable for `SalesTransaction.release_title`.
 */
export function extractReleaseTitleFromLineItem(lineItemName: string): string {
  const name = lineItemName.trim()
  if (!name) return name

  const parts = name.split(' - ')
  if (parts.length < 2) return name

  const firstSegmentLower = parts[0].trim().toLowerCase()
  const isProductTypePrefix = PHYSICAL_PRODUCT_PREFIXES.has(firstSegmentLower)

  if (isProductTypePrefix && parts.length >= 3) {
    // "T-Shirt - BLACKBOOK - Different (bundle) - XL"
    // → strip type + artist, keep "Different (bundle) - XL" (or just the design)
    // Return just the design name (parts[2]) as the release title.
    return parts[2]?.trim() || name
  }

  if (isProductTypePrefix && parts.length === 2) {
    // "T-Shirt - BLACKBOOK" → just the artist, no separate title
    return parts[1]?.trim() || name
  }

  // "BLACKBOOK - Different (Lim. Digipac CD)" → "Different (Lim. Digipac CD)"
  return parts.slice(1).join(' - ').trim() || name
}

// ── Order number normalisation ────────────────────────────────────────────────

/**
 * Strips common order-number decorations (#, spaces) so that Shopify's "#DM1121"
 * and Printful's "#DM1121" always match regardless of minor formatting
 * differences between the two exports.
 */
function normaliseOrderId(id: string): string {
  return id.replace(/^\s*#?\s*/, '').trim().toLowerCase()
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Formats a list of release titles into a concise summary string for use as
 * `SalesTransaction.release_title`. When an artist has only one release in the
 * order, that title is returned verbatim. When there are multiple, the first
 * title is shown with a count suffix. Falls back to the order ID when the list
 * is empty.
 */
function formatReleaseSummary(releases: string[], orderId: string): string {
  if (releases.length === 1) return releases[0]
  if (releases.length > 1) return `${releases[0]} (+${releases.length - 1} more)`
  return `Order ${orderId}`
}

// ── Core reconciliation ───────────────────────────────────────────────────────

/**
 * Reconciles Shopify orders with Printful production costs, producing a list
 * of net `SalesTransaction` objects attributed to the correct artist.
 *
 * **Algorithm:**
 * 1. Build a Printful cost lookup keyed by normalised order ID.
 * 2. For each Shopify order:
 *    a. Look up the Printful cost (default 0 if not found; emit a warning if
 *       Printful data was supplied but this order is missing).
 *    b. Calculate the total line-item revenue (sum of price × quantity).
 *    c. For each line item:
 *       - Extract the artist name.
 *       - Calculate the proportional net revenue:
 *         `line_net = (line_revenue / total_line_revenue) × (subtotal − printful_cost)`
 *    d. Aggregate by artist within the order (one SalesTransaction per artist).
 *
 * @param shopifyOrders - Raw Shopify orders produced by `parseShopifyRaw`.
 * @param printfulCosts - Raw Printful costs produced by `parsePrintfulCSV`.
 *   Pass an empty array when no Printful file has been uploaded; all subtotals
 *   are then treated as full net revenue (no cost deduction).
 * @returns Reconciled SalesTransaction array and any reconciliation warnings.
 */
export function reconcileMerchTransactions(
  shopifyOrders: ShopifyRawOrder[],
  printfulCosts: PrintfulRawCost[]
): MerchReconciliationResult {
  // ── Build Printful cost index ─────────────────────────────────────────────
  const printfulIndex = new Map<string, number>()
  for (const cost of printfulCosts) {
    printfulIndex.set(normaliseOrderId(cost.orderId), cost.total)
  }

  const hasPrintfulData = printfulCosts.length > 0

  const transactions: SalesTransaction[] = []
  const warnings: ReconciliationWarning[] = []

  for (const order of shopifyOrders) {
    const normId = normaliseOrderId(order.orderId)

    // ── Resolve Printful cost ─────────────────────────────────────────────
    const printfulCost = printfulIndex.get(normId)

    if (printfulCost === undefined && hasPrintfulData) {
      // Informational only — orders without Printful costs are normal for
      // self-fulfilled products (CDs, Vinyl, etc.) that bypass Printful.
      warnings.push({
        orderId: order.orderId,
        reason: 'no-printful-match',
        vendor: order.orderId,
        subtotal: order.subtotal,
      })
    }

    const costDeduction = printfulCost ?? 0
    const netOrderRevenue = order.subtotal - costDeduction

    // ── Calculate total line-item revenue for proportional distribution ──
    const totalLineItemRevenue = order.lineItems.reduce(
      (sum, li) => sum + li.unitPrice * li.quantity,
      0
    )

    // ── Aggregate net revenue per artist ──────────────────────────────────
    /** Map: artistName → accumulated net revenue */
    const artistNetMap = new Map<string, number>()
    /** Map: artistName → release titles (for transaction description) */
    const artistReleasesMap = new Map<string, string[]>()

    for (const lineItem of order.lineItems) {
      const artist = extractArtistFromLineItem(lineItem.lineItemName) ?? LABEL_REVENUE_ARTIST
      const lineItemRevenue = lineItem.unitPrice * lineItem.quantity

      // Proportional net revenue for this line item
      const lineNetRevenue =
        totalLineItemRevenue > 0
          ? (lineItemRevenue / totalLineItemRevenue) * netOrderRevenue
          : 0

      artistNetMap.set(artist, (artistNetMap.get(artist) ?? 0) + lineNetRevenue)

      const releaseTitle = extractReleaseTitleFromLineItem(lineItem.lineItemName)
      if (releaseTitle) {
        const existing = artistReleasesMap.get(artist) ?? []
        if (!existing.includes(releaseTitle)) {
          artistReleasesMap.set(artist, [...existing, releaseTitle])
        }
      }
    }

    // ── Produce one SalesTransaction per artist per order ─────────────────
    for (const [artist, netRevenue] of artistNetMap.entries()) {
      const releases = artistReleasesMap.get(artist) ?? []
      const releaseTitle = formatReleaseSummary(releases, order.orderId)

      transactions.push({
        id: crypto.randomUUID(),
        source: 'shopify',
        sales_month: order.salesMonth,
        platform: 'Shopify Merch',
        country: order.country,
        main_artist: artist,
        original_artist: artist,
        release_title: releaseTitle,
        track_title: '',
        upc_ean: '',
        isrc: '',
        catalog_number: order.orderId,
        quantity: order.lineItems
          .filter(li => (extractArtistFromLineItem(li.lineItemName) ?? LABEL_REVENUE_ARTIST) === artist)
          .reduce((s, li) => s + li.quantity, 0),
        net_revenue: netRevenue,
        currency: order.currency,
        is_physical: true,
      })
    }
  }

  return { transactions, warnings }
}

// ── parseNumber helper (used by both shopify-parser and printful-parser) ──────

/**
 * Parses a currency string that may include a currency symbol, thousand
 * separators, or European decimal formatting into a plain number.
 *
 * Examples:
 *   `"€15.79"` → `15.79`
 *   `"1.234,56"` → `1234.56`
 *   `"1,234.56"` → `1234.56`
 */
export function parseCurrencyAmount(raw: string): number {
  if (!raw) return 0
  // Strip currency symbols and whitespace
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned) return 0
  // European format: "1.234,56" — period = thousand separator, comma = decimal
  if (/\d\.\d{3},/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Comma as thousand separator (US/UK): "1,234.56"
  return parseFloat(cleaned.replace(/,/g, '')) || 0
}

// ── Shopify raw parser (re-exported here for use by the worker) ───────────────

/**
 * Parses a Shopify orders export CSV into grouped raw orders.
 *
 * Shopify exports one CSV row per line item; multiple rows share the same
 * `Name` (order ID). Only the first row of each order contains order-level
 * fields (Subtotal, Paid at, Currency, Billing Country). This function
 * groups rows by order ID and hydrates the `ShopifyRawOrder` structure.
 *
 * The `Vendor` column is intentionally NOT used as the artist name — the
 * artist is extracted from the product name by `extractArtistFromLineItem`
 * during reconciliation.
 *
 * @param content - Raw CSV file content string (UTF-8 or UTF-16 decoded).
 * @returns Grouped raw orders and any parse errors.
 */
export function parseShopifyRaw(content: string): {
  orders: ShopifyRawOrder[]
  errors: Array<{ row: number; reason: string; data: string }>
} {
  const stripped = content.startsWith('\uFEFF') ? content.slice(1) : content

  const parsed = Papa.parse<Record<string, string>>(stripped.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  const errors: Array<{ row: number; reason: string; data: string }> = []

  /** Ordered insertion tracker so we preserve the original order from the CSV. */
  const orderMap = new Map<string, ShopifyRawOrder>()

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i]

    try {
      const orderId = row['Name']?.trim()
      if (!orderId) continue

      const lineItemName = row['Lineitem name']?.trim() ?? ''
      const sku = row['Lineitem sku']?.trim() ?? ''
      const quantity = Math.max(1, parseCurrencyAmount(row['Lineitem quantity'] ?? ''))
      const unitPrice = parseCurrencyAmount(row['Lineitem price'] ?? '')

      const lineItem: ShopifyRawLineItem = { lineItemName, sku, quantity, unitPrice }

      if (!orderMap.has(orderId)) {
        // First row for this order — extract order-level fields
        const rawDate = row['Paid at']?.trim() || row['Created at']?.trim() || ''
        const salesMonth = normalizeDateToMonth(rawDate, 'shopify') || ''
        const subtotal = parseCurrencyAmount(row['Subtotal'] ?? '')
        const currency = (row['Currency']?.trim() || 'EUR').toUpperCase()
        const country = row['Billing Country']?.trim() || row['Shipping Country']?.trim() || 'Unknown'

        orderMap.set(orderId, {
          orderId,
          salesMonth,
          subtotal,
          currency,
          country,
          lineItems: [lineItem],
        })
      } else {
        // Additional line item row for an existing order
        const existing = orderMap.get(orderId)!

        // Backfill subtotal if it was zero on the first row but present here
        if (existing.subtotal === 0) {
          const sub = parseCurrencyAmount(row['Subtotal'] ?? '')
          if (sub > 0) existing.subtotal = sub
        }

        existing.lineItems.push(lineItem)
      }
    } catch (err) {
      errors.push({
        row: i + 2,
        reason: err instanceof Error ? err.message : 'Unknown error',
        data: JSON.stringify(row),
      })
    }
  }

  return { orders: Array.from(orderMap.values()), errors }
}
