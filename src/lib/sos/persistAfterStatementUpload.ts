import { runPersistSosAnalytics } from '@/lib/sos/runPersistSosAnalytics'
import { artistNamesMatch } from '@/lib/sos/artistNameKey'
import type { TerritoryMetricRow } from '@/lib/sos/data-processor'
import type { MerchOrderRow } from '@/lib/sos/merchOrderRows'
import type { ArtistRevenue, LabelArtist } from '@/lib/sos/types'

export interface PersistAfterUploadContext {
  artistName: string
  periodStart: string
  periodEnd: string
  territoryMetrics: TerritoryMetricRow[]
  merchOrderRows?: MerchOrderRow[]
  labelArtists: LabelArtist[]
  revenues: ArtistRevenue[]
  bronzeBatchIds: string[]
  batchId?: string
}

/**
 * Fire-and-forget gold-layer persist after a statement is uploaded to the portal.
 * Filters territory metrics to the published artist only.
 */
export async function persistAnalyticsAfterStatementUpload(
  ctx: PersistAfterUploadContext,
): Promise<void> {
  const artistMetrics = ctx.territoryMetrics.filter((m) =>
    artistNamesMatch(m.artistName, ctx.artistName),
  )
  const artistMerch = (ctx.merchOrderRows ?? []).filter((m) =>
    artistNamesMatch(m.artistName, ctx.artistName),
  )
  if (artistMetrics.length === 0) return

  const batchIds = [
    ...new Set([
      ...ctx.bronzeBatchIds,
      ...(ctx.batchId ? [ctx.batchId] : []),
    ]),
  ]

  // Period summaries are label-wide snapshots — upsert only via Trends / Save to Portal
  // (full roster). Draft uploads must not overwrite sos_period_summaries per artist.
  const result = await runPersistSosAnalytics({
    periodStart: ctx.periodStart,
    periodEnd: ctx.periodEnd,
    bronzeBatchIds: batchIds,
    territoryMetrics: artistMetrics,
    merchOrderRows: artistMerch.length > 0 ? artistMerch : undefined,
    labelArtists: ctx.labelArtists,
    includePeriodSummary: false,
  })

  if (!result.success) {
    console.warn('[persistAnalyticsAfterStatementUpload]', result.error)
  }
}