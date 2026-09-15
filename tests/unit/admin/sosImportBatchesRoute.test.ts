import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, readJson } from '../../helpers/api/routeTestkit'

const requireAdminFromRequestMock = vi.fn()
const createServiceRoleSupabaseClientMock = vi.fn()
const createImportBatchMock = vi.fn()
const findImportBatchByFileHashMock = vi.fn()
const updateImportBatchStatusMock = vi.fn()
const assertSettlementPeriodWritableMock = vi.fn()

vi.mock('@/lib/adminAuth', () => ({
  requireAdminFromRequest: (...args: unknown[]) => requireAdminFromRequestMock(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleSupabaseClient: (...args: unknown[]) =>
    createServiceRoleSupabaseClientMock(...args),
}))

vi.mock('@/lib/api/distributorImportBatches', () => ({
  createImportBatch: (...args: unknown[]) => createImportBatchMock(...args),
  findImportBatchByFileHash: (...args: unknown[]) => findImportBatchByFileHashMock(...args),
  updateImportBatchStatus: (...args: unknown[]) => updateImportBatchStatusMock(...args),
  listImportBatches: vi.fn(),
}))

vi.mock('@/lib/api/settlementPeriods', () => ({
  assertSettlementPeriodWritable: (...args: unknown[]) =>
    assertSettlementPeriodWritableMock(...args),
}))

async function loadRoute() {
  vi.resetModules()
  return import('../../../app/api/admin/sos/import-batches/route')
}

const FILE_HASH = 'ab'.repeat(32)

describe('POST /api/admin/sos/import-batches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdminFromRequestMock.mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    createServiceRoleSupabaseClientMock.mockResolvedValue({ kind: 'service' })
    findImportBatchByFileHashMock.mockResolvedValue(null)
    updateImportBatchStatusMock.mockResolvedValue(undefined)
    assertSettlementPeriodWritableMock.mockResolvedValue(undefined)
    createImportBatchMock.mockResolvedValue({
      id: 'batch-new',
      periodStart: '2025-10',
      periodEnd: '2026-03',
      distributor: 'believe',
      r2Key: 'sos-imports/batch-new/file.csv',
      fileHash: undefined,
      rowCount: 10,
      status: 'uploaded',
    })
  })

  it('does not persist file_hash at register so the upload path stays writable', async () => {
    const { POST } = await loadRoute()
    const res = await POST(
      jsonRequest('/api/admin/sos/import-batches', {
        method: 'POST',
        bearer: 'tok',
        body: {
          period_start: '2025-10',
          period_end: '2026-03',
          distributor: 'believe',
          filename: 'Believe_Q1_2026.csv',
          file_hash: FILE_HASH,
          row_count: 397003,
        },
      }),
    )

    expect(res.status).toBe(201)
    expect(createImportBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fileHash: null,
        distributor: 'believe',
        rowCount: 397003,
      }),
    )
  })

  it('returns the existing completed batch as a duplicate without inserting', async () => {
    findImportBatchByFileHashMock.mockResolvedValue({
      id: 'batch-old',
      r2Key: 'sos-imports/batch-old/file.csv',
      fileHash: FILE_HASH,
      status: 'completed',
    })
    const { POST } = await loadRoute()
    const { status, body } = await readJson<{ duplicate?: boolean }>(
      await POST(
        jsonRequest('/api/admin/sos/import-batches', {
          method: 'POST',
          bearer: 'tok',
          body: {
            period_start: '2025-10',
            period_end: '2026-03',
            distributor: 'believe',
            filename: 'Believe_Q1_2026.csv',
            file_hash: FILE_HASH,
          },
        }),
      ),
    )

    expect(status).toBe(200)
    expect(body.duplicate).toBe(true)
    expect(createImportBatchMock).not.toHaveBeenCalled()
  })

  it('does not treat an unconfirmed same-hash row as a duplicate (retry after failed archive)', async () => {
    findImportBatchByFileHashMock.mockResolvedValue({
      id: 'zombie-batch',
      r2Key: 'sos-imports/zombie/file.csv',
      fileHash: FILE_HASH,
      status: 'uploaded',
    })
    const { POST } = await loadRoute()
    const res = await POST(
      jsonRequest('/api/admin/sos/import-batches', {
        method: 'POST',
        bearer: 'tok',
        body: {
          period_start: '2025-10',
          period_end: '2026-03',
          distributor: 'believe',
          filename: 'Believe_Q1_2026.csv',
          file_hash: FILE_HASH,
        },
      }),
    )

    expect(res.status).toBe(201)
    expect(updateImportBatchStatusMock).toHaveBeenCalledWith(
      expect.anything(),
      'zombie-batch',
      'failed',
    )
    expect(createImportBatchMock).toHaveBeenCalled()
  })
})
