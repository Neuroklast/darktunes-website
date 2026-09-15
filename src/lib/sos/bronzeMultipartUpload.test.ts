import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/errors'
import type { DistributorImportBatch } from '@/lib/api/distributorImportBatches'

const getImportBatchByIdMock = vi.fn()

vi.mock('@/lib/api/distributorImportBatches', () => ({
  getImportBatchById: (...args: unknown[]) => getImportBatchByIdMock(...args),
}))

function makeBatch(
  overrides: Partial<DistributorImportBatch> = {},
): DistributorImportBatch {
  return {
    id: '6e4eb9fb-1e6d-4716-8e7a-cdf9c82801ef',
    periodStart: '2025-10',
    periodEnd: '2026-03',
    distributor: 'believe',
    r2Key: 'sos-imports/batch-1/file.csv',
    fileHash: undefined,
    rowCount: 10,
    status: 'uploaded',
    rulesPresetId: undefined,
    uploadedBy: 'admin-1',
    createdAt: '2026-09-15T00:00:00Z',
    ...overrides,
  }
}

describe('getWritableImportBatch', () => {
  beforeEach(() => {
    getImportBatchByIdMock.mockReset()
  })

  it('allows upload on a pending batch even when register sent a file hash', async () => {
    const { getWritableImportBatch } = await import('./bronzeMultipartUpload')
    const batch = makeBatch({ fileHash: 'ab'.repeat(32), status: 'uploaded' })
    getImportBatchByIdMock.mockResolvedValue(batch)

    await expect(getWritableImportBatch({} as never, batch.id)).resolves.toEqual(batch)
  })

  it('allows upload when file_hash is still null', async () => {
    const { getWritableImportBatch } = await import('./bronzeMultipartUpload')
    const batch = makeBatch({ fileHash: undefined, status: 'uploaded' })
    getImportBatchByIdMock.mockResolvedValue(batch)

    await expect(getWritableImportBatch({} as never, batch.id)).resolves.toEqual(batch)
  })

  it('rejects a completed archive', async () => {
    const { getWritableImportBatch } = await import('./bronzeMultipartUpload')
    getImportBatchByIdMock.mockResolvedValue(
      makeBatch({ fileHash: 'ab'.repeat(32), status: 'completed' }),
    )

    await expect(getWritableImportBatch({} as never, 'batch-1')).rejects.toMatchObject({
      status: 409,
      message: 'Import batch already has archived content',
    } satisfies Partial<ApiError>)
  })

  it('returns 404 when the batch is missing', async () => {
    const { getWritableImportBatch } = await import('./bronzeMultipartUpload')
    getImportBatchByIdMock.mockResolvedValue(null)

    await expect(getWritableImportBatch({} as never, 'missing')).rejects.toMatchObject({
      status: 404,
    })
  })
})
