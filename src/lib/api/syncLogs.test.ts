import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getSyncLogs, createSyncLog, updateSyncLogStatus } from './syncLogs'

type DbClient = SupabaseClient<Database>
type SyncLogRow = Database['public']['Tables']['sync_logs']['Row']

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
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

const mockLogRow: SyncLogRow = {
  id: 'log-001',
  artist_id: 'artist-abc',
  triggered_by: 'manual',
  status: 'success',
  details: { releasesUpserted: 3 },
  created_at: '2026-05-08T12:00:00Z',
}

describe('getSyncLogs', () => {
  it('returns empty array when no logs exist', async () => {
    const db = makeMockDb([])
    expect(await getSyncLogs(db)).toEqual([])
  })

  it('maps rows to SyncLog domain objects', async () => {
    const db = makeMockDb([mockLogRow])
    const [log] = await getSyncLogs(db)
    expect(log.id).toBe('log-001')
    expect(log.artistId).toBe('artist-abc')
    expect(log.status).toBe('success')
    expect(log.triggeredBy).toBe('manual')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'access denied', code: 'PGRST301' })
    await expect(getSyncLogs(db)).rejects.toThrow('access denied')
  })
})

describe('createSyncLog', () => {
  it('returns the created SyncLog', async () => {
    const db = makeMockDb(mockLogRow)
    const result = await createSyncLog(db, {
      artist_id: 'artist-abc',
      triggered_by: 'manual',
      status: 'pending',
    })
    expect(result.id).toBe('log-001')
    expect(result.status).toBe('success') // row echoed back
  })

  it('throws when error is returned', async () => {
    const db = makeMockDb(null, { message: 'insert failed', code: 'PGRST001' })
    await expect(
      createSyncLog(db, { artist_id: 'x', triggered_by: 'manual', status: 'pending' }),
    ).rejects.toThrow('insert failed')
  })
})

describe('updateSyncLogStatus', () => {
  it('returns the updated SyncLog', async () => {
    const updated = { ...mockLogRow, status: 'error' as const }
    const db = makeMockDb(updated)
    const result = await updateSyncLogStatus(db, 'log-001', 'error', { reason: 'timeout' })
    expect(result.status).toBe('error')
  })

  it('throws on database error', async () => {
    const db = makeMockDb(null, { message: 'update failed', code: 'PGRST001' })
    await expect(updateSyncLogStatus(db, 'log-001', 'error')).rejects.toThrow('update failed')
  })
})
