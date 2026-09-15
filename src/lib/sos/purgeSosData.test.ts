import { describe, expect, it, vi } from 'vitest'
import {
  confirmationMatches,
  isSosPurgeScope,
  purgeSosData,
  SOS_PURGE_CONFIRMATION,
} from './purgeSosData'

function makeDb(options: {
  batches?: Array<{ id: string; r2_key: string; status: string }>
  goldCounts?: Record<string, number>
}) {
  const batches = options.batches ?? []
  const goldCounts = options.goldCounts ?? {}
  const from = vi.fn((table: string) => {
    if (table === 'distributor_import_batches') {
      const selectResult = {
        data: batches,
        error: null,
      }
      const selectBuilder = {
        in: vi.fn(async () => selectResult),
        then: (resolve: (v: typeof selectResult) => unknown) => resolve(selectResult),
      }
      return {
        select: vi.fn(() => selectBuilder),
        delete: vi.fn(() => ({
          in: vi.fn(() => ({
            select: vi.fn(async () => ({
              data: batches.map((row) => ({ id: row.id })),
              error: null,
            })),
          })),
        })),
      }
    }
    const n = goldCounts[table] ?? 0
    return {
      delete: vi.fn(() => ({
        not: vi.fn(() => ({
          select: vi.fn(async () => ({
            data: Array.from({ length: n }, (_, i) => ({ id: `g${i}` })),
            error: null,
          })),
        })),
      })),
    }
  })
  return { from } as never
}

describe('SOS purge guards', () => {
  it('accepts only known scopes and exact confirmation phrases', () => {
    expect(isSosPurgeScope('failed_bronze')).toBe(true)
    expect(isSosPurgeScope('statements')).toBe(false)
    expect(confirmationMatches('bronze', 'DELETE BRONZE')).toBe(true)
    expect(confirmationMatches('bronze', 'delete bronze')).toBe(false)
    expect(SOS_PURGE_CONFIRMATION.failed_bronze).toBe('DELETE FAILED')
  })
})

describe('purgeSosData', () => {
  it('deletes incomplete bronze rows and R2 objects, not gold', async () => {
    const db = makeDb({
      batches: [
        { id: 'b1', r2_key: 'sos-imports/b1/a.csv', status: 'failed' },
        { id: 'b2', r2_key: 'sos-imports/b2/b.csv', status: 'uploaded' },
      ],
    })
    const deleteR2 = vi.fn(async () => undefined)
    const counts = await purgeSosData(db, 'failed_bronze', deleteR2)
    expect(deleteR2).toHaveBeenCalledTimes(2)
    expect(counts.bronze_deleted).toBe(2)
    expect(counts.r2_deleted).toBe(2)
    expect(counts.gold.artist_territory_metrics).toBe(0)
  })

  it('counts R2 failures but still deletes the batch rows', async () => {
    const db = makeDb({
      batches: [{ id: 'b1', r2_key: 'sos-imports/b1/a.csv', status: 'failed' }],
    })
    const deleteR2 = vi.fn(async () => {
      throw new Error('r2 down')
    })
    const counts = await purgeSosData(db, 'failed_bronze', deleteR2)
    expect(counts.r2_failed).toBe(1)
    expect(counts.bronze_deleted).toBe(1)
  })

  it('clears gold analytics tables only for the gold scope', async () => {
    const db = makeDb({
      goldCounts: {
        artist_territory_metrics: 3,
        merch_orders: 1,
        sos_period_summaries: 2,
        event_impact: 4,
      },
    })
    const counts = await purgeSosData(db, 'gold', async () => undefined)
    expect(counts.bronze_deleted).toBe(0)
    expect(counts.gold).toEqual({
      artist_territory_metrics: 3,
      merch_orders: 1,
      sos_period_summaries: 2,
      event_impact: 4,
    })
  })
})
