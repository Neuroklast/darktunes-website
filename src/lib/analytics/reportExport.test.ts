import { describe, it, expect } from 'vitest'
import type { ArtistListenerMetric } from '@/lib/api/artistListenerMetrics'
import type { ArtistTerritoryMetric } from '@/lib/api/artistTerritoryMetrics'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { StreamingStat } from '@/lib/api/streamingStats'
import { buildPortalAnalyticsCsv } from './reportExport'

describe('buildPortalAnalyticsCsv', () => {
  it('includes all sections with headers and data rows', () => {
    const stats: StreamingStat[] = [
      { id: 's1', artistId: 'a1', period: '2026-01', platform: 'spotify', streams: 1200, createdAt: '2026-01-01' },
    ]
    const territoryMetrics: ArtistTerritoryMetric[] = [
      {
        id: 't1',
        artistId: 'a1',
        period: '2026-01',
        platform: 'spotify',
        country: 'DE',
        streams: 800,
        revenueEur: 12.5,
        quantity: 0,
        sourceBatchId: undefined,
        updatedAt: '2026-01-01',
      },
    ]
    const listenerMetrics: ArtistListenerMetric[] = [
      {
        id: 'l1',
        artistId: 'a1',
        period: '2026-01',
        source: 'lastfm',
        metricType: 'listeners',
        value: 400,
        country: '',
        fetchedAt: '2026-01-01',
      },
    ]
    const statements: SalesStatement[] = [
      {
        id: 'stmt-1',
        artistId: 'a1',
        period: '2026-Q1',
        filename: 'q1.pdf',
        r2Key: 'statements/q1.pdf',
        periodStart: '2026-01-01',
        periodEnd: '2026-03-31',
        status: 'label_approved',
        amountEur: 99.5,
        labelNotes: undefined,
        labelApprovedAt: undefined,
        firstViewedAt: undefined,
        lastViewedAt: undefined,
        viewCount: 0,
        settlementPeriodId: undefined,
        documentType: 'original',
        correctionOfId: undefined,
        isArchived: false,
        createdAt: '2026-04-01',
      },
    ]

    const csv = buildPortalAnalyticsCsv({
      stats,
      territoryMetrics,
      listenerMetrics,
      statements,
    })

    expect(csv).toContain('# Streaming Stats')
    expect(csv).toContain('2026-01,spotify,1200')
    expect(csv).toContain('# Territory Metrics')
    expect(csv).toContain('DE,800,12.5')
    expect(csv).toContain('# Listener Metrics')
    expect(csv).toContain('# Statements')
    expect(csv).toContain('q1.pdf')
  })

  it('returns section headers when data arrays are empty', () => {
    const csv = buildPortalAnalyticsCsv({
      stats: [],
      territoryMetrics: [],
      listenerMetrics: [],
      statements: [],
    })
    expect(csv).toContain('# Streaming Stats')
    expect(csv).toContain('period,platform,streams')
  })
})