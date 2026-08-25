import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { listActivePlans, getPlanBySlug } from './plans'

type DbClient = SupabaseClient<Database>

function makeMockDb(plans: unknown[], features: unknown[]): DbClient {
  const from = vi.fn((table: string) => {
    if (table === 'plans') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: plans, error: null }),
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: features, error: null }),
    }
  })
  return { from } as unknown as DbClient
}

describe('plans DAL', () => {
  it('maps plans with features', async () => {
    const db = makeMockDb(
      [
        {
          id: 'p1',
          slug: 'starter',
          name: 'Starter',
          price_monthly_cents: 4900,
          price_yearly_cents: 47000,
          is_active: true,
        },
      ],
      [{ plan_id: 'p1', feature_key: 'epk_builder', value: 'true' }],
    )
    const plans = await listActivePlans(db)
    expect(plans).toHaveLength(1)
    expect(plans[0]?.features.epk_builder).toBe('true')
  })

  it('getPlanBySlug finds plan', async () => {
    const db = makeMockDb(
      [{ id: 'p1', slug: 'starter', name: 'Starter', price_monthly_cents: 0, price_yearly_cents: 0, is_active: true }],
      [],
    )
    const plan = await getPlanBySlug(db, 'starter')
    expect(plan?.slug).toBe('starter')
  })
})
