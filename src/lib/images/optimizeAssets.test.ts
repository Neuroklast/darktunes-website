import { describe, expect, it, vi } from 'vitest'
import { optimizeCatalogAssets } from '@/lib/images/optimizeAssets'

const downloadObjectBufferFromR2 = vi.fn()
const putObjectToR2 = vi.fn()

vi.mock('@/lib/r2Utils', () => ({
  downloadObjectBufferFromR2: (...args: unknown[]) => downloadObjectBufferFromR2(...args),
  putObjectToR2: (...args: unknown[]) => putObjectToR2(...args),
}))

vi.mock('@/lib/images/optimizeImage', () => ({
  optimizeImage: vi.fn(async () => ({
    buffer: Buffer.from('tiny'),
    mimeType: 'image/webp',
    filename: 'a.webp',
    skipped: false,
  })),
}))

function makeDb(rows: Array<Record<string, unknown>>) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const query = {
    select: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
    update,
  }
  return {
    db: { from: vi.fn().mockReturnValue(query) },
    query,
    update,
  }
}

describe('optimizeCatalogAssets', () => {
  it('optimizes explicit asset ids without requiring optimized_at null', async () => {
    downloadObjectBufferFromR2.mockResolvedValue(Buffer.from('original-bytes'))
    putObjectToR2.mockResolvedValue(undefined)
    const { db, query } = makeDb([
      {
        id: 'asset-1',
        r2_key: 'uploads/a.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1000,
        filename: 'a.jpg',
        original_filename: 'a.jpg',
        is_press_approved: false,
        original_size_bytes: null,
      },
    ])

    const result = await optimizeCatalogAssets({
      db: db as never,
      s3: {} as never,
      bucket: 'bucket',
      assetIds: ['asset-1'],
    })

    expect(query.in).toHaveBeenCalledWith('id', ['asset-1'])
    expect(query.is).not.toHaveBeenCalled()
    expect(putObjectToR2).toHaveBeenCalled()
    expect(result.processed).toBe(1)
    expect(result.next_cursor).toBeNull()
  })
})
