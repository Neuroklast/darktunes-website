import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getFeatureFlags, updateFeatureFlag } from './featureFlags'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

describe('featureFlags DAL', () => {
  it('maps flags', async () => {
    const db = makeMockDb([{
      organization_id: '00000000-0000-0000-0000-000000000000',
      id: 'artist.marketing',
      label: 'Marketing',
      enabled: true,
      target_role: 'artist',
      updated_at: '2026-01-01T00:00:00Z',
    }])
    const flags = await getFeatureFlags(db)
    expect(flags[0]).toMatchObject({ id: 'artist.marketing', enabled: true, targetRole: 'artist' })
  })

  it('updates flag', async () => {
    const db = makeMockDb({
      organization_id: '00000000-0000-0000-0000-000000000000',
      id: 'artist.marketing',
      label: 'Marketing',
      enabled: false,
      target_role: 'artist',
      updated_at: '2026-01-01T00:00:00Z',
    })
    const flag = await updateFeatureFlag(db, 'artist.marketing', false)
    expect(flag.enabled).toBe(false)
  })
})
