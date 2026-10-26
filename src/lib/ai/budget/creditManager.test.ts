import { describe, expect, it, vi } from 'vitest'
import { CreditBudgetManager } from './creditManager'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const configured = {
  enabled: true, buffer_percent: 25, artist_monthly: 1000,
  editor_monthly: 2000, admin_monthly: 10000,
  model_prices: { 'fast-model': { input_per_million_eur: 1, output_per_million_eur: 4, reasoning_per_million_eur: 6 } },
}
function dbMock(settings = configured, rpc = vi.fn(async () => ({ data: { ok: true }, error: null }))) {
  const single = vi.fn(async () => ({ data: settings, error: null }))
  const db = {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
    rpc,
  } as unknown as SupabaseClient<Database>
  return { db, rpc }
}
const usage = { input_tokens: 1000, output_tokens: 1000, reasoning_tokens: 0, total_tokens: 2000 }

describe('CreditBudgetManager', () => {
  it('uses one shared artist scope, independent of the band member', async () => {
    const { db, rpc } = dbMock()
    const manager = await CreditBudgetManager.load(db)
    await manager.reserve('req:0', 'fast-model', 'member-a', 'artist-123', 'artist', 1000, 1000)
    expect(rpc).toHaveBeenCalledWith('reserve_ai_credits', expect.objectContaining({
      p_scope: 'artist', p_scope_id: 'artist-123', p_allowance: 1000, p_request_id: 'req:0',
    }))
  })

  it('reserves for the worst case of expensive reasoning output', async () => {
    const { db, rpc } = dbMock()
    const manager = await CreditBudgetManager.load(db)
    await manager.reserve('req:1', 'fast-model', 'user-a', null, 'editor', 1000, 1000)
    const call = rpc.mock.calls[0] as unknown as [string, { p_credits: number }]
    expect(call[1].p_credits).toBe(9) // (0.001 + 0.006) * 1.25 = 8.75 credits
  })

  it('rejects exhausted monthly allowances', async () => {
    const { db } = dbMock(configured, vi.fn(async () => ({ data: { ok: false, remaining: 0 }, error: null })))
    const manager = await CreditBudgetManager.load(db)
    await expect(manager.reserve('req:2', 'fast-model', 'member-a', 'artist-123', 'artist', 1000, 1000))
      .rejects.toMatchObject({ code: 'AI_CREDITS_EXCEEDED', status: 429 })
  })

  it('refuses usage of an unpriced model when enabled', async () => {
    const { db } = dbMock()
    const manager = await CreditBudgetManager.load(db)
    await expect(manager.reserve('req:3', 'unknown', 'member-a', null, 'admin', 1000, 1000))
      .rejects.toMatchObject({ code: 'AI_CREDITS_UNAVAILABLE' })
  })

  it('writes zero charge but the actual provider costs on a failed turn', async () => {
    const { db, rpc } = dbMock()
    const manager = await CreditBudgetManager.load(db)
    await manager.settle('req:4', usage, 'fast-model', false)
    expect(rpc).toHaveBeenCalledWith('settle_ai_credits', expect.objectContaining({
      p_request_id: 'req:4', p_charge: 0, p_provider_cost: 0.005,
    }))
  })

  it('does not invoke billing functions before an admin enables credits', async () => {
    const { db, rpc } = dbMock({ ...configured, enabled: false })
    const manager = await CreditBudgetManager.load(db)
    await manager.reserve('req:5', 'unknown', 'member-a', null, 'admin', 1000, 1000)
    await manager.settle('req:5', usage, 'unknown')
    expect(rpc).not.toHaveBeenCalled()
  })
})
