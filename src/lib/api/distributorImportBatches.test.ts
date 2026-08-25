import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createImportBatch, DuplicateImportBatchError } from './distributorImportBatches'

type DbClient = SupabaseClient<Database>

function makeDb(error: { message: string; code?: string } | null = null) {
  const result = {
    data: error
      ? null
      : {
          id: 'batch-1',
          period_start: '2024-01',
          period_end: '2024-03',
          distributor: 'believe',
          r2_key: 'sos-imports/batch-1/file.csv',
          file_hash: 'ab'.repeat(32),
          row_count: 10,
          status: 'uploaded',
          rules_preset_id: null,
          uploaded_by: 'user-1',
          created_at: '2024-01-01T00:00:00Z',
        },
    error,
  }
  const p = Promise.resolve(result)
  const builder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return { from: vi.fn().mockReturnValue(builder) } as unknown as DbClient
}

describe('createImportBatch', () => {
  it('maps unique-violation on an active file_hash to DuplicateImportBatchError', async () => {
    const db = makeDb({ message: 'duplicate key', code: '23505' })
    await expect(
      createImportBatch(db, {
        periodStart: '2024-01',
        periodEnd: '2024-03',
        distributor: 'believe',
        r2Key: 'sos-imports/batch-2/file.csv',
        fileHash: 'ab'.repeat(32),
      }),
    ).rejects.toBeInstanceOf(DuplicateImportBatchError)
  })
})
