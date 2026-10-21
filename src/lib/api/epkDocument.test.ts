import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { saveEpkDocument } from './epkDocument'

const sampleDocument = {
  version: 2 as const,
  pageFormat: 'a4' as const,
  orientation: 'portrait' as const,
  pages: [
    {
      id: 'p1',
      name: 'Cover',
      width: 794,
      height: 1123,
      background: { type: 'color' as const, color: '#101010' },
    },
  ],
  elements: [],
  fonts: [],
  metadata: {},
}

function createMockDb({
  currentVersion,
  updateRows,
  insertError,
  updateError,
}: {
  currentVersion?: number
  updateRows?: unknown[]
  insertError?: { message: string } | null
  updateError?: { message: string } | null
} = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(() => ({
        then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
          resolve({
            data: currentVersion === undefined ? null : { epk_document_version: currentVersion },
            error: null,
          }),
        catch: vi.fn(),
        finally: vi.fn(),
      })),
      insert: vi.fn().mockImplementation(() => ({
        then: (resolve: (value: { error: unknown }) => void) =>
          resolve({ error: insertError ?? null }),
        catch: vi.fn(),
        finally: vi.fn(),
      })),
      update: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockImplementation(() => ({
          then: (resolve: (value: { data: unknown; error: unknown }) => void) =>
            resolve({ data: updateRows ?? [], error: updateError ?? null }),
          catch: vi.fn(),
          finally: vi.fn(),
        })),
        catch: vi.fn(),
        finally: vi.fn(),
      })),
      catch: vi.fn(),
      finally: vi.fn(),
    })),
  } as unknown as SupabaseClient<Database>
}

describe('saveEpkDocument', () => {
  it('inserts a new row when no document exists yet', async () => {
    const db = createMockDb({ currentVersion: undefined })
    await saveEpkDocument(db as never, 'artist-1', sampleDocument, 'user-1')
    expect(db.from).toHaveBeenCalledWith('artist_epks')
  })

  it('updates and returns next version when expectedVersion matches', async () => {
    const db = createMockDb({ currentVersion: 5, updateRows: [{ id: 'row-1' }] })
    const result = await saveEpkDocument(
      db as never,
      'artist-1',
      sampleDocument,
      'user-1',
      { expectedVersion: 5 },
    )
    expect(result.documentVersion).toBe(6)
  })

  it('throws EPK_DOCUMENT_STALE when expectedVersion does not match current version', async () => {
    const db = createMockDb({ currentVersion: 5 })
    await expect(
      saveEpkDocument(db as never, 'artist-1', sampleDocument, 'user-1', {
        expectedVersion: 3,
      }),
    ).rejects.toThrow('EPK_DOCUMENT_STALE')
  })

  it('throws EPK_DOCUMENT_STALE when conditional update matches zero rows', async () => {
    const db = createMockDb({ currentVersion: 5, updateRows: [] })
    await expect(
      saveEpkDocument(db as never, 'artist-1', sampleDocument, 'user-1', {
        expectedVersion: 5,
      }),
    ).rejects.toThrow('EPK_DOCUMENT_STALE')
  })
})
