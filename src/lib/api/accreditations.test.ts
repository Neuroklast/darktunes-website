import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createRequest, listRequests, updateStatus } from './accreditations'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
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

const row = {
  organization_id: '00000000-0000-0000-0000-000000000000',
  id: 'acc-1',
  journalist_id: 'user-1',
  event_name: 'Festival',
  event_date: '2026-06-01',
  publication: 'Dark Mag',
  reason: 'Coverage',
  status: 'pending' as const,
  admin_note: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('accreditations DAL', () => {
  it('creates request', async () => {
    const db = makeMockDb(row)
    const item = await createRequest(db, {
      journalist_id: 'user-1',
      event_name: 'Festival',
      event_date: '2026-06-01',
      publication: 'Dark Mag',
      reason: 'Coverage',
    })
    expect(item.status).toBe('pending')
  })

  it('lists requests', async () => {
    const db = makeMockDb([row])
    const items = await listRequests(db)
    expect(items[0].eventName).toBe('Festival')
  })

  it('updates status', async () => {
    const db = makeMockDb({ ...row, status: 'approved', admin_note: 'Granted' })
    const item = await updateStatus(db, 'acc-1', 'approved', 'Granted')
    expect(item.status).toBe('approved')
  })
})
