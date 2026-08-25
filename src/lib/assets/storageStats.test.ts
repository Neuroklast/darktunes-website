import { describe, expect, it, vi } from 'vitest'
import {
  coerceNonNegInt,
  parseAggregateSum,
  parseRpcStats,
  resolveCatalogStorageStats,
  sumSizeBytesPaginated,
} from './storageStats'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Db = SupabaseClient<Database>

const ORG = '00000000-0000-0000-0000-000000000000'

describe('coerceNonNegInt', () => {
  it('coerces number string and bigint', () => {
    expect(coerceNonNegInt(12.9)).toBe(12)
    expect(coerceNonNegInt('2048000')).toBe(2048000)
    expect(coerceNonNegInt(BigInt(99))).toBe(99)
    expect(coerceNonNegInt(-3)).toBe(0)
    expect(coerceNonNegInt(null)).toBe(0)
  })
})

describe('parseRpcStats', () => {
  it('parses array row (legacy RETURNS TABLE)', () => {
    expect(parseRpcStats([{ used_bytes: '100', asset_count: '2', zero_size_count: '1' }])).toEqual({
      usedBytes: 100,
      assetCount: 2,
      zeroSizeCount: 1,
    })
  })

  it('parses JSON object (current function)', () => {
    expect(
      parseRpcStats({ used_bytes: 500, asset_count: 3, zero_size_count: 0 }),
    ).toEqual({ usedBytes: 500, assetCount: 3, zeroSizeCount: 0 })
  })

  it('parses JSON string payload', () => {
    expect(
      parseRpcStats(JSON.stringify({ used_bytes: 10, asset_count: 1, zero_size_count: 0 })),
    ).toEqual({ usedBytes: 10, assetCount: 1, zeroSizeCount: 0 })
  })

  it('returns null for empty array', () => {
    expect(parseRpcStats([])).toBeNull()
  })
})

describe('parseAggregateSum', () => {
  it('reads sum key from aggregate select', () => {
    expect(parseAggregateSum([{ sum: '999' }])).toBe(999)
  })
})

describe('sumSizeBytesPaginated', () => {
  it('sums pages for one organization', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ size_bytes: 100 }, { size_bytes: 50 }, { size_bytes: 0 }],
      error: null,
    })
    const eq = vi.fn().mockReturnThis()

    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq,
        order: vi.fn().mockReturnThis(),
        range,
      }),
    } as unknown as Db

    const stats = await sumSizeBytesPaginated(db, ORG)
    expect(stats.usedBytes).toBe(150)
    expect(stats.assetCount).toBe(3)
    expect(stats.zeroSizeCount).toBe(1)
    expect(stats.source).toBe('paginated')
    expect(eq).toHaveBeenCalledWith('organization_id', ORG)
  })
})

describe('resolveCatalogStorageStats', () => {
  it('prefers RPC with organization id', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { used_bytes: 42, asset_count: 7, zero_size_count: 1 },
      error: null,
    })
    const db = { rpc } as unknown as Db

    const stats = await resolveCatalogStorageStats(db, ORG)
    expect(stats).toEqual({
      usedBytes: 42,
      assetCount: 7,
      zeroSizeCount: 1,
      source: 'rpc',
    })
    expect(rpc).toHaveBeenCalledWith('get_assets_storage_stats', {
      p_organization_id: ORG,
    })
  })

  it('falls back to aggregate then paginated', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ size_bytes: 10 }],
      error: null,
    })
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockImplementation((sel: string, opts?: { head?: boolean }) => {
        if (typeof sel === 'string' && sel.includes('sum')) {
          return {
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'agg off' } }),
          }
        }
        if (opts?.head) {
          return {
            eq: vi.fn().mockReturnThis(),
            then: undefined,
            count: 1,
            error: null,
          }
        }
        return {
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          range,
        }
      }),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    })

    const db = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rpc' } }),
      from,
    } as unknown as Db

    // When aggregate fails, paginated is used
    const stats = await resolveCatalogStorageStats(db, ORG)
    expect(stats.source).toBe('paginated')
    expect(stats.usedBytes).toBe(10)
  })
})
