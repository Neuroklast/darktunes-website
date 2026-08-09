import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  assertSettlementPeriodWritable,
  assertSettlementPeriodWritableById,
  buildPeriodLabel,
  isPeriodWritable,
  normalizeSettlementPeriodBounds,
  normalizeSettlementPeriodDate,
  SettlementPeriodNotWritableError,
} from './settlementPeriods'

type DbClient = SupabaseClient<Database>

describe('settlementPeriods helpers', () => {
  it('builds a single-month label when start equals end', () => {
    expect(buildPeriodLabel('2025-10-01', '2025-10-01')).toBe('2025-10-01')
  })

  it('builds a range label for multi-month periods', () => {
    expect(buildPeriodLabel('2025-10-01', '2026-03-31')).toBe('2025-10-01 – 2026-03-31')
  })

  it('treats open and under_review periods as writable', () => {
    expect(isPeriodWritable('open')).toBe(true)
    expect(isPeriodWritable('under_review')).toBe(true)
    expect(isPeriodWritable('approved')).toBe(true)
    expect(isPeriodWritable('locked')).toBe(false)
    expect(isPeriodWritable('archived')).toBe(false)
  })
})

describe('normalizeSettlementPeriodDate', () => {
  it('passes through YYYY-MM-DD values', () => {
    expect(normalizeSettlementPeriodDate('2023-08-01', false)).toBe('2023-08-01')
    expect(normalizeSettlementPeriodDate('2026-03-31', true)).toBe('2026-03-31')
  })

  it('converts YYYY-MM bronze/UI months to first/last day of month', () => {
    expect(normalizeSettlementPeriodDate('2023-08', false)).toBe('2023-08-01')
    expect(normalizeSettlementPeriodDate('2026-03', true)).toBe('2026-03-31')
    expect(normalizeSettlementPeriodDate('2024-02', true)).toBe('2024-02-29')
  })

  it('rejects invalid period strings', () => {
    expect(() => normalizeSettlementPeriodDate('2023/08')).toThrow(/Invalid settlement period date/)
    expect(() => normalizeSettlementPeriodDate('August 2023')).toThrow(/Invalid settlement period date/)
  })
})

describe('normalizeSettlementPeriodBounds', () => {
  it('normalizes multi-month bronze ranges', () => {
    expect(normalizeSettlementPeriodBounds('2023-08', '2026-03')).toEqual({
      periodStart: '2023-08-01',
      periodEnd: '2026-03-31',
    })
  })
})

describe('assertSettlementPeriodWritable', () => {
  it('allows mutations when no period row exists yet', async () => {
    const eq = vi.fn().mockReturnThis()
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as DbClient

    await expect(
      assertSettlementPeriodWritable(db, '2025-01-01', '2025-03-31'),
    ).resolves.toBeUndefined()
  })

  it('normalizes YYYY-MM bronze periods before querying settlement_periods', async () => {
    const eq = vi.fn().mockReturnThis()
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq,
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as unknown as DbClient

    await expect(
      assertSettlementPeriodWritable(db, '2023-08', '2026-03'),
    ).resolves.toBeUndefined()

    expect(eq).toHaveBeenCalledWith('period_start', '2023-08-01')
    expect(eq).toHaveBeenCalledWith('period_end', '2026-03-31')
  })

  it('rejects locked periods', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { status: 'locked' }, error: null }),
      }),
    } as unknown as DbClient

    await expect(
      assertSettlementPeriodWritable(db, '2025-01-01', '2025-03-31'),
    ).rejects.toBeInstanceOf(SettlementPeriodNotWritableError)
  })
})

describe('assertSettlementPeriodWritableById', () => {
  it('rejects archived periods', async () => {
    const row = {
      id: 'period-1',
      organization_id: '00000000-0000-0000-0000-000000000000',
      period_start: '2025-01-01',
      period_end: '2025-03-31',
      label: '2025-01-01 – 2025-03-31',
      status: 'archived',
      notes: null,
      locked_at: '2025-04-01T00:00:00Z',
      locked_by: 'user-1',
      archived_at: '2025-05-01T00:00:00Z',
      archived_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-05-01T00:00:00Z',
    }
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: row, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    } as unknown as DbClient

    await expect(assertSettlementPeriodWritableById(db, 'period-1')).rejects.toBeInstanceOf(
      SettlementPeriodNotWritableError,
    )
  })
})