import type { SafeProcessedArtistData } from './types'
import type { CreateLineItemInput } from '@/lib/api/salesStatementLineItems'

export function buildLineItemsFromArtistData(
  statementId: string,
  artistData: SafeProcessedArtistData,
): CreateLineItemInput[] {
  const items: CreateLineItemInput[] = []

  for (const row of artistData.platformBreakdown) {
    items.push({
      statementId,
      platform: row.platform,
      streams: row.streamQuantity ?? 0,
      revenueEur: row.revenue,
      quantity: row.quantity,
    })
  }

  for (const row of artistData.countryBreakdown) {
    items.push({
      statementId,
      country: row.country,
      revenueEur: row.revenue,
      quantity: row.quantity,
    })
  }

  return items
}

export function computeTotalStreamsFromArtistData(artistData: SafeProcessedArtistData): number {
  return artistData.platformBreakdown.reduce(
    (sum, row) => sum + (row.streamQuantity ?? 0),
    0,
  )
}

export function monthToPeriodDate(month: string, endOfMonth = false): string | undefined {
  if (!/^\d{4}-\d{2}$/.test(month)) return undefined
  const [year, mon] = month.split('-').map(Number)
  if (!year || !mon || mon < 1 || mon > 12) return undefined
  if (!endOfMonth) return `${month}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}