import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileManager } from './useSosFileManager'

const mocks = vi.hoisted(() => ({
  initialFiles: [] as Array<{
    id: string
    name: string
    size: number
    type: 'believe'
    uploadedAt: string
    bronzeBatchId?: string
  }>,
  download: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('@/hooks/useLocalKV', async () => {
  const { useState } = await import('react')
  return {
    useKV: () => useState(mocks.initialFiles),
  }
})

vi.mock('@/lib/i18n/accountingFallbacks', () => ({
  useMergedAccountingLabels: (fallback: Record<string, string>) => fallback,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/sos/bronzeDownload', () => ({
  downloadBronzeCsvText: mocks.download,
}))

vi.mock('@/lib/sos/bronzeUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sos/bronzeUpload')>()
  return { ...actual, uploadBronzeDistributorCsv: mocks.upload }
})

const archivedMeta = {
  id: 'local-file',
  name: 'Believe_Q1_2026.csv',
  size: 68_000_000,
  type: 'believe' as const,
  uploadedAt: '2026-11-04T00:00:00.000Z',
  bronzeBatchId: 'completed-batch',
}

describe('useFileManager archive restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.initialFiles = [{ ...archivedMeta }]
    mocks.download.mockResolvedValue('Sales Month,Artist\n2026-01,Reaper')
  })

  it('restores an existing file in place and never creates a second R2 archive', async () => {
    const { result } = renderHook(() => useFileManager('believe'))
    expect(result.current.files[0]?.data).toBeUndefined()

    await act(async () => {
      await result.current.restoreArchivedFile('local-file')
    })

    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0]).toMatchObject({
      id: 'local-file',
      bronzeBatchId: 'completed-batch',
      data: 'Sales Month,Artist\n2026-01,Reaper',
    })
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.download).toHaveBeenCalledWith('completed-batch')
    expect(mocks.upload).not.toHaveBeenCalled()

    act(() => {
      result.current.applyParseResult({
        fileId: 'local-file',
        rowsParsed: 1,
        rowsSkipped: 0,
        uniqueArtistsCount: 1,
        periodStart: '2026-01',
        periodEnd: '2026-01',
      })
    })

    expect(result.current.fileStates['local-file']?.status).toBe('done')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('does not re-download or duplicate a source when restored twice', async () => {
    const { result } = renderHook(() => useFileManager('believe'))
    await act(async () => { await result.current.restoreArchivedFile('local-file') })
    await act(async () => { await result.current.restoreArchivedFile('local-file') })
    expect(result.current.files).toHaveLength(1)
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('adds a workspace-only archive once, with its existing batch lineage', async () => {
    mocks.initialFiles = []
    const { result } = renderHook(() => useFileManager('believe'))
    await act(async () => {
      await result.current.restoreArchivedBatch({
        id: 'completed-batch',
        name: 'Believe_Q1_2026.csv',
        periodStart: '2026-01',
        periodEnd: '2026-03',
      })
    })
    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0]).toMatchObject({
      name: 'Believe_Q1_2026.csv',
      bronzeBatchId: 'completed-batch',
      data: 'Sales Month,Artist\n2026-01,Reaper',
    })
    expect(result.current.fileStates[result.current.files[0].id]?.status).toBe('processing')

    await act(async () => {
      await result.current.restoreArchivedBatch({
        id: 'completed-batch',
        name: 'Believe_Q1_2026.csv',
      })
    })
    expect(result.current.files).toHaveLength(1)
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('preserves the archived file card after a failed download and allows retry', async () => {
    mocks.download.mockRejectedValueOnce(new Error('Download failed (403)'))
    const { result } = renderHook(() => useFileManager('believe'))
    let failure: unknown
    await act(async () => {
      try {
        await result.current.restoreArchivedFile('local-file')
      } catch (err) {
        failure = err
      }
    })
    expect(failure).toBeInstanceOf(Error)
    expect(result.current.files).toHaveLength(1)
    expect(result.current.files[0].bronzeBatchId).toBe('completed-batch')
    expect(result.current.files[0].data).toBeUndefined()
    expect(result.current.fileStates['local-file']?.status).toBe('error')

    await act(async () => { await result.current.restoreArchivedFile('local-file') })
    expect(result.current.files[0].data).toContain('Reaper')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('ignores downloaded data if the file was removed during the request', async () => {
    let resolveDownload: ((value: string) => void) | undefined
    mocks.download.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveDownload = resolve
    }))
    const { result } = renderHook(() => useFileManager('believe'))
    let request: Promise<void> | undefined
    act(() => {
      request = result.current.restoreArchivedFile('local-file')
      result.current.removeFile('local-file')
    })
    await act(async () => {
      resolveDownload?.('Sales Month,Artist\n2026-01,Reaper')
      await request
    })
    expect(result.current.files).toHaveLength(0)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
