import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ArtistRevenue } from '@/lib/sos/types'
import { runPersistSosAnalytics } from './runPersistSosAnalytics'

describe('runPersistSosAnalytics', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs gold persist to the admin API instead of a server action', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, metricsUpserted: 3 }),
    })
    vi.stubGlobal('fetch', fetchImpl)

    const result = await runPersistSosAnalytics({
      periodStart: '2026-01',
      periodEnd: '2026-03',
      territoryMetrics: [
        {
          artistName: 'Artist A',
          period: '2026-01',
          platform: 'Spotify',
          country: 'DE',
          streams: 100,
          revenueEur: 12.5,
          quantity: 0,
        },
      ],
      labelArtists: [{ id: 'a1', name: 'Artist A', artistId: 'a1' }],
      revenues: [
        {
          artist: 'Artist A',
          totalRevenue: 100,
          finalAmount: 70,
          platformBreakdown: [{ platform: 'Spotify', revenue: 100, quantity: 0 }],
        } as ArtistRevenue,
      ],
      bronzeBatchIds: ['batch-1'],
    })

    expect(result.success).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/admin/sos/persist-analytics',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as { body: string }).body) as {
      periodSummary: { totalRevenue: number; sourceBatchIds: string[] }
      revenues: Array<{ artist: string; believeSplitPercentage: number }>
    }
    expect(body.periodSummary.totalRevenue).toBe(100)
    expect(body.periodSummary.sourceBatchIds).toEqual(['batch-1'])
    expect(body.revenues[0]).toEqual(expect.objectContaining({ artist: 'Artist A' }))
  })

  it('returns a failure result when the persist request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Failed to fetch')),
    )

    const result = await runPersistSosAnalytics({
      periodStart: '2026-01',
      periodEnd: '2026-01',
      territoryMetrics: [
        {
          artistName: 'Artist A',
          period: '2026-01',
          platform: 'Spotify',
          country: 'DE',
          streams: 1,
          revenueEur: 1,
          quantity: 0,
        },
      ],
      labelArtists: [{ id: 'a1', name: 'Artist A', artistId: 'a1' }],
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Failed to fetch/)
  })
})
