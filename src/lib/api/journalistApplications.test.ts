import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getJournalistApplications,
  getJournalistApplicationByUserId,
  createJournalistApplication,
  updateApplicationStatus,
} from './journalistApplications'

type DbClient = SupabaseClient<Database>
type ApplicationRow = Database['public']['Tables']['journalist_applications']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
}

function makeMockDb(data: unknown = null, error: unknown = null): DbClient {
  return { from: vi.fn().mockReturnValue(makeBuilder(data, error)) } as unknown as DbClient
}

const mockApplicationRow: ApplicationRow = {
  organization_id: '00000000-0000-0000-0000-000000000000',
  id: 'app-uuid-1',
  user_id: 'user-uuid-1',
  email: 'journalist@magazine.com',
  name: 'Jane Press',
  outlet: 'Dark Magazine',
  message: 'I want to cover your release.',
  website_url: 'https://darkmagazine.com',
  reason: 'We cover underground electronic music and want to feature your artists.',
  status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  created_at: '2024-06-01T00:00:00Z',
}

describe('getJournalistApplications', () => {
  it('returns empty array when no applications exist', async () => {
    const db = makeMockDb([])
    const result = await getJournalistApplications(db)
    expect(result).toEqual([])
  })

  it('maps rows to JournalistApplication domain objects', async () => {
    const db = makeMockDb([mockApplicationRow])
    const result = await getJournalistApplications(db)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('app-uuid-1')
    expect(result[0].userId).toBe('user-uuid-1')
    expect(result[0].email).toBe('journalist@magazine.com')
    expect(result[0].name).toBe('Jane Press')
    expect(result[0].outlet).toBe('Dark Magazine')
    expect(result[0].websiteUrl).toBe('https://darkmagazine.com')
    expect(result[0].reason).toBe(
      'We cover underground electronic music and want to feature your artists.',
    )
    expect(result[0].status).toBe('pending')
    expect(result[0].reviewedBy).toBeUndefined()
    expect(result[0].reviewedAt).toBeUndefined()
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'connection error', code: '500' })
    await expect(getJournalistApplications(db)).rejects.toThrow('connection error')
  })
})

describe('getJournalistApplicationByUserId', () => {
  it('returns null when no application exists (PGRST116)', async () => {
    const db = makeMockDb(null, { code: 'PGRST116', message: 'Not found' })
    const result = await getJournalistApplicationByUserId(db, 'user-uuid-2')
    expect(result).toBeNull()
  })

  it('returns the mapped application when found', async () => {
    const db = makeMockDb(mockApplicationRow)
    const result = await getJournalistApplicationByUserId(db, 'user-uuid-1')
    expect(result).not.toBeNull()
    expect(result?.outlet).toBe('Dark Magazine')
  })

  it('throws on non-PGRST116 errors', async () => {
    const db = makeMockDb(null, { code: 'PGRST301', message: 'RLS violation' })
    await expect(getJournalistApplicationByUserId(db, 'user-uuid-1')).rejects.toThrow(
      'RLS violation',
    )
  })
})

describe('createJournalistApplication', () => {
  it('inserts and returns the mapped domain object', async () => {
    const db = makeMockDb(mockApplicationRow)
    const result = await createJournalistApplication(db, {
      email: 'journalist@magazine.com',
      name: 'Jane Press',
      outlet: 'Dark Magazine',
      user_id: 'user-uuid-1',
      website_url: 'https://darkmagazine.com',
      reason: 'We cover underground electronic music and want to feature your artists.',
    })
    expect(result.id).toBe('app-uuid-1')
    expect(result.status).toBe('pending')
    expect(result.websiteUrl).toBe('https://darkmagazine.com')
    expect(result.reason).toBe(
      'We cover underground electronic music and want to feature your artists.',
    )
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'unique constraint', code: '23505' })
    await expect(
      createJournalistApplication(db, {
        email: 'dup@example.com',
        name: 'Dup',
        outlet: 'Outlet',
      }),
    ).rejects.toThrow('unique constraint')
  })

  it('throws when no row is returned', async () => {
    const db = makeMockDb(null, null)
    await expect(
      createJournalistApplication(db, {
        email: 'empty@example.com',
        name: 'Empty',
        outlet: 'Outlet',
      }),
    ).rejects.toThrow('No data returned from createJournalistApplication')
  })
})

describe('updateApplicationStatus', () => {
  it('updates status to approved and returns mapped object', async () => {
    const approvedRow: ApplicationRow = {
      ...mockApplicationRow,
      status: 'approved',
      reviewed_by: 'admin-uuid',
      reviewed_at: '2024-06-02T10:00:00Z',
    }
    const db = makeMockDb(approvedRow)
    const result = await updateApplicationStatus(db, 'app-uuid-1', 'approved', 'admin-uuid')
    expect(result.status).toBe('approved')
    expect(result.reviewedBy).toBe('admin-uuid')
    expect(result.reviewedAt).toBe('2024-06-02T10:00:00Z')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'not found', code: 'PGRST116' })
    await expect(
      updateApplicationStatus(db, 'missing', 'rejected', 'admin-uuid'),
    ).rejects.toThrow('not found')
  })

  it('throws when no row is returned', async () => {
    const db = makeMockDb(null, null)
    await expect(
      updateApplicationStatus(db, 'app-uuid-1', 'rejected', 'admin-uuid'),
    ).rejects.toThrow('No data returned from updateApplicationStatus')
  })
})
