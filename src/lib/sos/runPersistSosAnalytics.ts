import type { PersistSosAnalyticsResult } from '@/lib/sos/persistSosAnalyticsCore'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import type { ArtistRevenue, LabelArtist } from '@/lib/sos/types'
import { toArtistShareRates } from '@/lib/sos/applyArtistShareToPortalMetrics'

export interface RunPersistSosAnalyticsParams {
  periodStart: string
  periodEnd: string
  territoryMetrics: TerritoryMetricRow[]
  merchOrderRows?: MerchOrderRow[]
  labelArtists: LabelArtist[]
  revenues?: ArtistRevenue[]
  bronzeBatchIds?: string[]
  /** Draft uploads must not overwrite the label-wide period snapshot. */
  includePeriodSummary?: boolean
}

async function readBearerToken(): Promise<string> {
  try {
    const { getAdminAccessToken } = await import('@/lib/admin/getAccessToken')
    return (await getAdminAccessToken()) || ''
  } catch {
    return ''
  }
}

export async function runPersistSosAnalytics(
  params: RunPersistSosAnalyticsParams,
): Promise<PersistSosAnalyticsResult> {
  const {
    periodStart,
    periodEnd,
    territoryMetrics,
    merchOrderRows = [],
    labelArtists,
    revenues = [],
    bronzeBatchIds = [],
    includePeriodSummary = true,
  } = params

  const periodSummary =
    includePeriodSummary && revenues.length > 0 && periodStart
      ? {
          periodStart,
          periodEnd: periodEnd || periodStart,
          totalRevenue: revenues.reduce((s, r) => s + r.totalRevenue, 0),
          totalPayout: revenues.reduce((s, r) => s + r.finalAmount, 0),
          artistCount: revenues.length,
          artistBreakdowns: revenues.map((r) => ({
            artist: r.artist,
            revenue: r.totalRevenue,
            payout: r.finalAmount,
          })),
          platformBreakdowns: revenues.flatMap((r) => r.platformBreakdown),
          sourceBatchIds: bronzeBatchIds,
        }
      : undefined

  try {
    const token = await readBearerToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch('/api/admin/sos/persist-analytics', {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify({
        periodStart,
        periodEnd,
        batchIds: bronzeBatchIds,
        territoryMetrics,
        merchOrderRows,
        labelArtists: labelArtists.map((la) => ({
          name: la.name,
          artistId: la.artistId,
        })),
        revenues: revenues.map(toArtistShareRates),
        periodSummary,
      }),
    })

    const json = (await res.json().catch(() => null)) as PersistSosAnalyticsResult | { error?: string } | null
    if (!res.ok) {
      const message =
        json && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
          ? json.error
          : `Persist failed (${res.status})`
      return { success: false, error: message }
    }
    if (json && typeof json === 'object' && 'success' in json) {
      return json as PersistSosAnalyticsResult
    }
    return { success: false, error: 'Persist failed' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Persist failed',
    }
  }
}