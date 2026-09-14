import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateExcel } from '@/lib/sos/export-utils'
import { normalizeExcelExportSettings } from '@/lib/sos/excelExportSettings'
import { useExports } from './useSosExports'
import type { LabelArtist, LabelInfo, SafeProcessedArtistData } from '@/lib/sos/types'

const {
  mockToastSuccess,
  mockToastError,
  mockGeneratePDF,
  mockDownloadBlob,
  mockUploadStatement,
  mockIsValidArtistId,
  mockIsValidPeriod,
} = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
  mockGeneratePDF: vi.fn(),
  mockDownloadBlob: vi.fn(),
  mockUploadStatement: vi.fn(),
  mockIsValidArtistId: vi.fn(),
  mockIsValidPeriod: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useMessages: () => ({ admin: { accounting: {} } }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    loading: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/sos/export-utils', () => ({
  generatePDF: mockGeneratePDF,
  generateExcel: vi.fn(),
  downloadBlob: mockDownloadBlob,
  generateZipOfAllStatements: vi.fn(),
}))

vi.mock('@/lib/sos/validation', () => ({
  isValidArtistId: mockIsValidArtistId,
  isValidPeriod: mockIsValidPeriod,
}))

vi.mock('../../app/portal/statements/_actions/uploadStatement', () => ({
  uploadStatement: mockUploadStatement,
}))

vi.mock('@/lib/sos/persistAfterStatementUpload', () => ({
  persistAnalyticsAfterStatementUpload: vi.fn(async () => undefined),
}))

const labelInfo: LabelInfo = { name: 'darkTunes', address: '', invoiceNumberPrefix: 'SOS' }

function makeProcessedArtist(artist: string): SafeProcessedArtistData {
  return {
    artist,
    finalPayout: 123.45,
    platformBreakdown: [],
    countryBreakdown: [],
  } as unknown as SafeProcessedArtistData
}

describe('useSosExports.handleDownloadPDF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeneratePDF.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    mockIsValidArtistId.mockReturnValue(true)
    mockIsValidPeriod.mockReturnValue(true)
  })

  it('downloads PDF locally without portal upload when autoUploadToPortal is false', async () => {
    const labelArtists: LabelArtist[] = [
      { id: '1', name: 'Artist One', artistId: '123e4567-e89b-12d3-a456-426614174000' },
    ]

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        labelArtists,
        {},
        [],
        false,
      ),
    )

    await act(async () => {
      await result.current.handleDownloadPDF('Artist One')
    })

    expect(mockUploadStatement).not.toHaveBeenCalled()
    expect(mockDownloadBlob).toHaveBeenCalledOnce()
    expect(mockToastSuccess).toHaveBeenCalledWith('PDF for "Artist One" downloaded')
  })
})

describe('useSosExports.handlePublishToPortal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeneratePDF.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
    mockIsValidArtistId.mockReturnValue(true)
    mockIsValidPeriod.mockReturnValue(false)
  })

  it('uploads statement PDF to portal with fallback quarter period', async () => {
    mockUploadStatement.mockResolvedValue({ success: true, statementId: 'stmt-123' })

    const labelArtists: LabelArtist[] = [
      { id: '1', name: 'Artist One', artistId: '123e4567-e89b-12d3-a456-426614174000' },
    ]

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        'invalid-period',
        '2026-03',
        {},
        {},
        labelArtists,
        {},
        []
      )
    )

    await act(async () => {
      await result.current.handlePublishToPortal('Artist One')
    })

    expect(mockGeneratePDF).toHaveBeenCalledOnce()
    expect(mockUploadStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: '123e4567-e89b-12d3-a456-426614174000',
        filename: 'Artist_One_statement.pdf',
        period: `Q1-${new Date().getFullYear()}`,
        amountEur: 123.45,
        pdfBase64: expect.any(String),
      })
    )
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Draft statement saved to portal. Approve in Settlement Center to notify the artist.',
    )
  })

  it('shows upload error and does not fall back to local download', async () => {
    mockIsValidPeriod.mockReturnValue(true)
    mockUploadStatement.mockResolvedValue({ success: false, error: 'Portal unavailable' })

    const labelArtists: LabelArtist[] = [
      { id: '1', name: 'Artist One', artistId: '123e4567-e89b-12d3-a456-426614174000' },
    ]

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        labelArtists,
        {},
        []
      )
    )

    await act(async () => {
      await result.current.handlePublishToPortal('Artist One')
    })

    expect(mockToastError).toHaveBeenCalledWith('Portal unavailable')
    expect(mockDownloadBlob).not.toHaveBeenCalled()
  })
})

describe('useSosExports.buildCorrectionPdfBase64', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGeneratePDF.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  })

  it('returns base64 PDF with overridden payout amount', async () => {
    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        [],
        {},
        [],
      ),
    )

    let pdfBase64: string | null = null
    await act(async () => {
      pdfBase64 = await result.current.buildCorrectionPdfBase64('Artist One', 250.5)
    })

    expect(pdfBase64).toBeTruthy()
    expect(mockGeneratePDF).toHaveBeenCalledWith(
      expect.objectContaining({ finalPayout: 250.5 }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      [],
    )
  })

  it('returns null when artist data is missing', async () => {
    const { result } = renderHook(() =>
      useExports([], labelInfo, '2026-03', '2026-03', {}, {}, [], {}, []),
    )

    let pdfBase64: string | null = 'pending'
    await act(async () => {
      pdfBase64 = await result.current.buildCorrectionPdfBase64('Missing Artist', 10)
    })

    expect(pdfBase64).toBeNull()
  })
})

describe('useSosExports.handleDownloadExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('downloads the worker-built workbook when Raw is on', async () => {
    const mockGenerateExcel = vi.mocked(generateExcel)
    const workerBlob = new Blob(['worker-xlsx'])
    const requestExcelBlob = vi.fn().mockResolvedValue(workerBlob)

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        [],
        {},
        [],
        false,
        undefined,
        requestExcelBlob,
      ),
    )

    await act(async () => {
      await result.current.handleDownloadExcel('Artist One')
    })

    expect(requestExcelBlob).toHaveBeenCalledWith(
      expect.objectContaining({ artist: 'Artist One' }),
    )
    expect(mockGenerateExcel).not.toHaveBeenCalled()
    expect(mockDownloadBlob).toHaveBeenCalledWith(
      workerBlob,
      expect.stringMatching(/Artist_One_statement\.xlsx$/),
    )
  })

  it('does not ask the worker when the Raw sheet is off', async () => {
    const mockGenerateExcel = vi.mocked(generateExcel)
    mockGenerateExcel.mockResolvedValue(new Blob(['xlsx']))
    const requestExcelBlob = vi.fn().mockResolvedValue(new Blob(['worker']))

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        [],
        {},
        [],
        false,
        undefined,
        requestExcelBlob,
      ),
    )

    await act(async () => {
      await result.current.handleDownloadExcel(
        'Artist One',
        normalizeExcelExportSettings({ sheets: { raw: false } }),
      )
    })

    expect(requestExcelBlob).not.toHaveBeenCalled()
    expect(mockGenerateExcel).toHaveBeenCalled()
    expect(mockDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/summary-only\.xlsx$/),
    )
  })

  it('does not download a file when original-report tabs cannot be built', async () => {
    const mockGenerateExcel = vi.mocked(generateExcel)
    mockGenerateExcel.mockResolvedValue(new Blob(['xlsx']))
    const requestExcelBlob = vi.fn().mockResolvedValue(null)

    const { result } = renderHook(() =>
      useExports(
        [makeProcessedArtist('Artist One')],
        labelInfo,
        '2026-03',
        '2026-03',
        {},
        {},
        [],
        {},
        [],
        false,
        undefined,
        requestExcelBlob,
      ),
    )

    await act(async () => {
      await result.current.handleDownloadExcel('Artist One')
    })

    expect(requestExcelBlob).toHaveBeenCalled()
    expect(mockGenerateExcel).not.toHaveBeenCalled()
    expect(mockDownloadBlob).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalled()
  })
})
