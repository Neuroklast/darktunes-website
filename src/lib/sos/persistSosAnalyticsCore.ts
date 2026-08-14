/**
 * Core gold-layer persistence logic (service-role Supabase client).
 * Used by the server action and admin API routes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { upsertTerritoryMetrics } from '@/lib/api/artistTerritoryMetrics'
import { upsertStreamingStats } from '@/lib/api/streamingStats'
import { updateImportBatchStatus } from '@/lib/api/distributorImportBatches'
import { computeEventImpactForArtist } from '@/lib/analytics/eventImpact'
import { computePromoImpactForArtist } from '@/lib/analytics/promoImpactCompute'
import { upsertSosPeriodSummary, type UpsertSosPeriodSummaryInput } from '@/lib/api/sosPeriodSummaries'
import { upsertMerchOrders } from '@/lib/api/merchOrders'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import { writeAppLog } from '@/lib/appLog'
import { normalizeArtistNameKey } from '@/lib/sos/artistNameKey'
import {
  applyArtistShareToMerchOrders,
  applyArtistShareToTerritoryMetrics,
  toArtistShareRates,
  type ArtistShareRates,
} from '@/lib/sos/applyArtistShareToPortalMetrics'
import type { ArtistRevenue } from '@/lib/sos/types'

type ServiceClient = SupabaseClient<Database>

export interface PersistSosAnalyticsInput {
  periodStart: string
  periodEnd: string
  batchId?: string
  batchIds?: string[]
  territoryMetrics: TerritoryMetricRow[]
  merchOrderRows?: MerchOrderRow[]
  labelArtists: Array<{ name: string; artistId?: string }>
  /** Used only to scale portal gold revenue by the artist share. */
  revenues?: Array<ArtistShareRates | ArtistRevenue>
  periodSummary?: UpsertSosPeriodSummaryInput
}

export interface PersistSosAnalyticsResult {
  success: boolean
  metricsUpserted?: number
  artistsProcessed?: number
  eventImpactRows?: number
  eventImpactWarnings?: string[]
  promoImpactRows?: number
  promoImpactWarnings?: string[]
  merchOrdersUpserted?: number
  warnings?: string[]
  error?: string
}

function toShareRates(
  revenues: PersistSosAnalyticsInput['revenues'],
): ArtistShareRates[] {
  if (!revenues || revenues.length === 0) return []
  return revenues.map((row) =>
    'believeRevenue' in row ? toArtistShareRates(row) : row,
  )
}

function buildArtistIdLookup(
  labelArtists: PersistSosAnalyticsInput['labelArtists'],
): Map<string, string> {
  const map = new Map<string, string>()
  for (const la of labelArtists) {
    if (la.artistId) {
      map.set(normalizeArtistNameKey(la.name), la.artistId)
    }
  }
  return map
}

export async function persistSosAnalyticsCore(
  serviceSupabase: ServiceClient,
  input: PersistSosAnalyticsInput,
): Promise<PersistSosAnalyticsResult> {
  try {
    if (input.territoryMetrics.length === 0) {
      await writeAppLog({
        source: 'persistSosAnalyticsCore',
        level: 'warn',
        message: 'No territory metrics to persist',
        details: { periodStart: input.periodStart, periodEnd: input.periodEnd },
      })
      return { success: false, error: 'No territory metrics to persist' }
    }

    const artistLookup = buildArtistIdLookup(input.labelArtists)
    const shareRates = toShareRates(input.revenues)
    const portalTerritoryMetrics = applyArtistShareToTerritoryMetrics(
      input.territoryMetrics,
      shareRates,
    )

    const resolvedBatchIds = [
      ...new Set([
        ...(input.batchIds ?? []),
        ...(input.batchId ? [input.batchId] : []),
      ]),
    ]
    const primaryBatchId = resolvedBatchIds[0] ?? null

    const upsertRows = []
    for (const row of portalTerritoryMetrics) {
      const artistId = artistLookup.get(normalizeArtistNameKey(row.artistName))
      if (!artistId) continue
      upsertRows.push({
        artistId,
        period: row.period,
        platform: row.platform,
        country: row.country,
        streams: row.streams,
        revenueEur: row.revenueEur,
        quantity: row.quantity,
        sourceBatchId: primaryBatchId,
      })
    }

    if (upsertRows.length === 0) {
      await writeAppLog({
        source: 'persistSosAnalyticsCore',
        level: 'warn',
        message: 'No metrics matched portal-linked artists',
        details: {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          metricRows: input.territoryMetrics.length,
        },
      })
      return {
        success: false,
        error: 'No metrics matched portal-linked artists. Link artists in the Rules roster first.',
      }
    }

    const metricsUpserted = await upsertTerritoryMetrics(serviceSupabase, upsertRows)

    const streamRollup = new Map<string, number>()
    for (const row of upsertRows) {
      const key = `${row.artistId}|${row.period}|${row.platform}`
      streamRollup.set(key, (streamRollup.get(key) ?? 0) + row.streams)
    }

    await upsertStreamingStats(
      serviceSupabase,
      Array.from(streamRollup.entries()).map(([key, streams]) => {
        const [artistId, period, platform] = key.split('|')
        return { artistId, period, platform, streams }
      }),
    )

    const artistIds = [...new Set(upsertRows.map((r) => r.artistId))]
    let eventImpactRows = 0
    const eventImpactWarnings: string[] = []
    let promoImpactRows = 0
    const promoImpactWarnings: string[] = []
    for (const artistId of artistIds) {
      try {
        eventImpactRows += await computeEventImpactForArtist(serviceSupabase, artistId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown event impact error'
        eventImpactWarnings.push(message)
        console.error('[persistSosAnalyticsCore] event impact failed:', err)
        await writeAppLog({
          source: 'persistSosAnalyticsCore',
          level: 'warn',
          message: 'Event impact computation failed',
          details: { artistId, error: message },
        })
      }
      try {
        promoImpactRows += await computePromoImpactForArtist(serviceSupabase, artistId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown promo impact error'
        promoImpactWarnings.push(message)
        console.error('[persistSosAnalyticsCore] promo impact failed:', err)
        await writeAppLog({
          source: 'persistSosAnalyticsCore',
          level: 'warn',
          message: 'Promo impact computation failed',
          details: { artistId, error: message },
        })
      }
    }

    for (const batchId of resolvedBatchIds) {
      await updateImportBatchStatus(serviceSupabase, batchId, 'completed')
    }

    let merchOrdersUpserted = 0
    if (input.merchOrderRows && input.merchOrderRows.length > 0) {
      const merchRows = []
      for (const row of applyArtistShareToMerchOrders(input.merchOrderRows, shareRates)) {
        const artistId = artistLookup.get(normalizeArtistNameKey(row.artistName))
        if (!artistId) continue
        merchRows.push({
          ...row,
          artistId,
          sourceBatchId: primaryBatchId,
        })
      }
      if (merchRows.length > 0) {
        merchOrdersUpserted = await upsertMerchOrders(serviceSupabase, merchRows)
      }
    }

    if (input.periodSummary) {
      await upsertSosPeriodSummary(serviceSupabase, {
        ...input.periodSummary,
        sourceBatchIds: [
          ...new Set([
            ...(input.periodSummary.sourceBatchIds ?? []),
            ...resolvedBatchIds,
          ]),
        ],
      })
    }

    return {
      success: true,
      metricsUpserted,
      artistsProcessed: artistIds.length,
      eventImpactRows,
      eventImpactWarnings: eventImpactWarnings.length > 0 ? eventImpactWarnings : undefined,
      promoImpactRows,
      promoImpactWarnings: promoImpactWarnings.length > 0 ? promoImpactWarnings : undefined,
      merchOrdersUpserted: merchOrdersUpserted > 0 ? merchOrdersUpserted : undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[persistSosAnalyticsCore] Error:', err)
    await writeAppLog({
      source: 'persistSosAnalyticsCore',
      level: 'error',
      message: 'SOS analytics persistence failed',
      details: {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        error: message,
      },
    })
    return {
      success: false,
      error: message,
    }
  }
}