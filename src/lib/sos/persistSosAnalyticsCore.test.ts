import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  goldStatementDivergenceWarning,
  persistSosAnalyticsCore,
} from './persistSosAnalyticsCore'
import { computeEventImpactForArtist } from '@/lib/analytics/eventImpact'
import { updateImportBatchStatus } from '@/lib/api/distributorImportBatches'

vi.mock('@/lib/api/artistTerritoryMetrics', () => ({
  upsertTerritoryMetrics: vi.fn(async () => 2),
}))

vi.mock('@/lib/api/streamingStats', () => ({
  upsertStreamingStats: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api/distributorImportBatches', () => ({
  updateImportBatchStatus: vi.fn(async () => undefined),
}))

vi.mock('@/lib/api/sosPeriodSummaries', () => ({
  upsertSosPeriodSummary: vi.fn(async () => undefined),
}))

vi.mock('@/lib/analytics/eventImpact', () => ({
  computeEventImpactForArtist: vi.fn(async () => 3),
}))

vi.mock('@/lib/analytics/promoImpactCompute', () => ({
  computePromoImpactForArtist: vi.fn(async () => 2),
}))

vi.mock('@/lib/api/merchOrders', () => ({
  upsertMerchOrders: vi.fn(async (_db: unknown, rows: unknown[]) => rows.length),
}))

const { writeAppLogMock } = vi.hoisted(() => ({
  writeAppLogMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/appLog', () => ({
  writeAppLog: writeAppLogMock,
}))

function makeServiceDb(statements: unknown[] = []) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockResolvedValue({ data: statements, error: null }),
    })),
  } as never
}

describe('goldStatementDivergenceWarning', () => {
  it('is silent within 0.05 EUR and warns above', () => {
    expect(goldStatementDivergenceWarning(10, 10)).toBeNull()
    expect(goldStatementDivergenceWarning(10.04, 10)).toBeNull()
    expect(goldStatementDivergenceWarning(10.2, 50)).toMatch(/differs from approved statements/)
  })
})

describe('persistSosAnalyticsCore', () => {
  beforeEach(() => {
    writeAppLogMock.mockClear()
    vi.mocked(updateImportBatchStatus).mockClear()
  })

  it('returns event impact row count on success', async () => {
    const result = await persistSosAnalyticsCore(makeServiceDb(), {
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 100,
        revenueEur: 10,
        quantity: 0,
      }],
      labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
    })

    expect(result.success).toBe(true)
    expect(result.metricsUpserted).toBe(2)
    expect(result.eventImpactRows).toBe(3)
    expect(result.promoImpactRows).toBe(2)
  })

  it('upserts merch orders when provided', async () => {
    const result = await persistSosAnalyticsCore(makeServiceDb(), {
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 100,
        revenueEur: 10,
        quantity: 0,
      }],
      merchOrderRows: [{
        externalId: 'm1',
        artistName: 'Band A',
        source: 'shopify',
        period: '2024-01',
        productTitle: 'Shirt',
        country: 'DE',
        quantity: 1,
        revenueEur: 25,
      }],
      labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
    })

    expect(result.success).toBe(true)
    expect(result.merchOrdersUpserted).toBe(1)
  })

  it('fails when no metrics match linked artists', async () => {
    const result = await persistSosAnalyticsCore(makeServiceDb(), {
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Unknown',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 1,
        revenueEur: 1,
        quantity: 0,
      }],
      labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
    })

    expect(result.success).toBe(false)
    expect(writeAppLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'persistSosAnalyticsCore',
        level: 'warn',
        message: 'No metrics matched portal-linked artists',
      }),
    )
  })

  it('logs event impact failures and returns warnings', async () => {
    vi.mocked(computeEventImpactForArtist).mockRejectedValueOnce(new Error('event db error'))

    const result = await persistSosAnalyticsCore(makeServiceDb(), {
      periodStart: '2024-01',
      periodEnd: '2024-01',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 100,
        revenueEur: 10,
        quantity: 0,
      }],
      labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
    })

    expect(result.success).toBe(true)
    expect(result.eventImpactWarnings).toEqual(['event db error'])
    expect(writeAppLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'persistSosAnalyticsCore',
        level: 'warn',
        message: 'Event impact computation failed',
      }),
    )
  })

  it('does not overwrite bronze row_count with the upsert length', async () => {
    await persistSosAnalyticsCore(makeServiceDb(), {
      periodStart: '2024-01',
      periodEnd: '2024-01',
      batchId: 'batch-1',
      territoryMetrics: [{
        artistName: 'Band A',
        period: '2024-01',
        platform: 'Spotify',
        country: 'DE',
        streams: 100,
        revenueEur: 10,
        quantity: 0,
      }],
      labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
    })

    expect(updateImportBatchStatus).toHaveBeenCalledWith(expect.anything(), 'batch-1', 'completed')
    expect(updateImportBatchStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      'completed',
      expect.any(Number),
    )
  })

  it('returns a warning when gold revenue diverges from approved statements', async () => {
    const result = await persistSosAnalyticsCore(
      makeServiceDb([
        {
          amount_eur: 50,
          status: 'label_approved',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
          period: '2024-01',
          document_type: 'original',
        },
      ]),
      {
        periodStart: '2024-01',
        periodEnd: '2024-01',
        territoryMetrics: [{
          artistName: 'Band A',
          period: '2024-01',
          platform: 'Spotify',
          country: 'DE',
          streams: 100,
          revenueEur: 10,
          quantity: 0,
        }],
        labelArtists: [{ name: 'Band A', artistId: 'artist-1' }],
      },
    )

    expect(result.success).toBe(true)
    expect(result.warnings?.[0]).toMatch(/differs from approved statements/)
  })
})