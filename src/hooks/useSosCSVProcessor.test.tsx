import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCSVProcessor } from './useSosCSVProcessor'

const {
  mockFetchExchangeRates,
  mockFetchHistoricalExchangeRates,
  mockComputeAutoMappings,
  mockToastSuccess,
  mockToastWarning,
  mockToastError,
} = vi.hoisted(() => ({
  mockFetchExchangeRates: vi.fn(),
  mockFetchHistoricalExchangeRates: vi.fn(),
  mockComputeAutoMappings: vi.fn(() => []),
  mockToastSuccess: vi.fn(),
  mockToastWarning: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('next-intl', () => {
  const t = (key: string) => key
  return { useTranslations: () => t }
})

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    warning: mockToastWarning,
    error: mockToastError,
  },
}))

vi.mock('@/lib/sos/auto-mapping', () => ({
  computeAutoMappings: mockComputeAutoMappings,
}))

vi.mock('@/lib/sos/clientAppLog', () => ({
  logClientAppEvent: vi.fn(),
}))

vi.mock('@/lib/sos/currency', () => ({
  fetchExchangeRates: mockFetchExchangeRates,
  fetchHistoricalExchangeRates: mockFetchHistoricalExchangeRates,
}))

class WorkerMock {
  public onmessage: ((event: MessageEvent) => void) | null = null
  public onerror: ((event: ErrorEvent) => void) | null = null
  public postMessage = vi.fn()
  public terminate = vi.fn()
}

const workerInstances: WorkerMock[] = []

function makeConfig() {
  return {
    compilationFilters: [],
    artistMappings: [],
    splitFees: [],
    manualRevenues: [],
    expenses: [],
    excludePhysical: false,
    csvAliases: [],
    labelArtists: [],
    ignoredEntries: [],
    distributionFeePercentage: 0,
  }
}

describe('useCSVProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workerInstances.length = 0
    mockFetchExchangeRates.mockResolvedValue({ source: 'live', rates: { USD: 1.1 } })
    mockFetchHistoricalExchangeRates.mockResolvedValue({ source: 'live', rates: {} })

    class MockWorker extends WorkerMock {
      constructor() {
        super()
        workerInstances.push(this)
      }
    }

    vi.stubGlobal('Worker', MockWorker)
  })

  it('starts with idle initial state when no files are provided', async () => {
    const { result } = renderHook(() => useCSVProcessor([], [], makeConfig()))

    await waitFor(() => {
      expect(result.current.exchangeRatesLoading).toBe(false)
    })

    expect(result.current.isProcessing).toBe(false)
    expect(result.current.processedData).toEqual([])
    expect(result.current.revenues).toEqual([])
    expect(workerInstances).toHaveLength(1)
  })

  it('handles worker error path and exits processing state', async () => {
    const file = {
      id: 'f-1',
      name: 'believe.csv',
      size: 10,
      type: 'believe' as const,
      data: 'artist,revenue\nA,10',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    }

    const { result } = renderHook(() => useCSVProcessor([file], [], makeConfig()))

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true)
    })

    const worker = workerInstances[0]
    await act(async () => {
      worker?.onmessage?.({ data: { type: 'error', message: 'invalid csv' } } as MessageEvent)
    })

    expect(mockToastError).toHaveBeenCalledWith('CSV processing error', { description: 'invalid csv' })
    expect(result.current.isProcessing).toBe(false)
  })

  it('processes worker success result and maps revenues', async () => {
    const file = {
      id: 'f-2',
      name: 'believe.csv',
      size: 12,
      type: 'believe' as const,
      data: 'artist,revenue\nA,12',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    }

    const { result } = renderHook(() => useCSVProcessor([file], [], makeConfig()))

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true)
    })

    const worker = workerInstances[0]
    const payload = {
      type: 'result',
      data: {
        processedData: [
          {
            artist: 'Artist A',
            believeRevenue: 12,
            bandcampRevenue: 0,
            darkmerchRevenue: 0,
            manualRevenue: 0,
            grossRevenue: 12,
            splitPercentage: 50,
            finalPayout: 6,
            totalQuantity: 1,
            totalExpenses: 0,
            distributionFeeDeducted: 0,
            totalStreamRevenue: 0,
            totalDownloadRevenue: 12,
            platformBreakdown: [],
            countryBreakdown: [],
            monthlyBreakdown: [],
            releaseBreakdown: [],
            totalPhysicalRevenue: 0,
          },
        ],
        artistTrees: [],
        collabTree: [],
        filteredCompilations: [],
        uniqueArtists: ['Artist A'],
        periodStart: '2026-01',
        periodEnd: '2026-01',
        totalGrossAllData: 12,
        releaseTitlesByArtistIncFeaturing: {},
        territoryMetrics: [],
        merchOrderRows: [],
      },
    }

    await act(async () => {
      worker?.onmessage?.({ data: payload } as MessageEvent)
    })

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(false)
      expect(result.current.processedData).toHaveLength(1)
    })

    expect(result.current.uniqueArtists).toEqual(['Artist A'])
    expect(result.current.revenues[0]?.artist).toBe('Artist A')
    expect(result.current.revenues[0]?.finalAmount).toBe(6)
  })
})