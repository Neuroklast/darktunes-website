import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logDownload, getDownloadHistory } from './journalistDownloads'

type DbClient = SupabaseClient<Database>

function makeBuilder(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  const p = Promise.resolve(result)
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
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
  id: 'dl-1',
  journalist_id: 'user-1',
  release_id: 'release-1',
  asset_id: 'asset-1',
  asset_key: 'promo/file.wav',
  downloaded_at: '2026-01-01T00:00:00Z',
}

describe('journalistDownloads DAL', () => {
  it('logs download', async () => {
    const db = makeMockDb(row)
    const item = await logDownload(db, {
      journalist_id: 'user-1',
      release_id: 'release-1',
      asset_id: 'asset-1',
      asset_key: 'promo/file.wav',
    })
    expect(item.assetKey).toBe('promo/file.wav')
    expect(item.assetId).toBe('asset-1')
  })

  it('gets history', async () => {
    const db = makeMockDb([row])
    const items = await getDownloadHistory(db, 'user-1')
    expect(items).toHaveLength(1)
  })
})
