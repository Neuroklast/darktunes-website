import { describe, expect, it } from 'vitest'
import {
  toStatementSourceProvenance,
  type DistributorImportBatch,
} from './distributorImportBatches'

function batch(overrides: Partial<DistributorImportBatch> = {}): DistributorImportBatch {
  return {
    id: 'batch-1',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    distributor: 'believe',
    r2Key: 'bronze/believe/abc_report.csv',
    fileHash: 'deadbeef'.repeat(8),
    rowCount: 1200,
    status: 'completed',
    rulesPresetId: undefined,
    uploadedBy: undefined,
    createdAt: '2025-02-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('toStatementSourceProvenance', () => {
  it('exposes chain-of-custody fields without r2Key', () => {
    const prov = toStatementSourceProvenance(batch())
    expect(prov.batchId).toBe('batch-1')
    expect(prov.distributor).toBe('believe')
    expect(prov.fileHash).toBe('deadbeef'.repeat(8))
    expect(prov.canDownloadSource).toBe(true)
    expect(prov).not.toHaveProperty('r2Key')
  })

  it('disables download when failed or missing hash', () => {
    expect(toStatementSourceProvenance(batch({ status: 'failed' })).canDownloadSource).toBe(
      false,
    )
    expect(toStatementSourceProvenance(batch({ fileHash: undefined })).canDownloadSource).toBe(
      false,
    )
  })
})
