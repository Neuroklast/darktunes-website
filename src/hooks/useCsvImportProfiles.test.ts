import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCsvImportProfiles } from './useCsvImportProfiles'

afterEach(() => { vi.unstubAllGlobals() })

const customProfile = {
  id: 'custom-profile', name: 'Custom', type: 'financial' as const,
  delimiter: ',' as const, autoDetectHeaders: ['Artist', 'Net Revenue', 'Date'],
  columnMapping: { artistName: 'Artist', netRevenue: 'Net Revenue', salesMonth: 'Date' },
  parserSource: 'believe' as const,
}

describe('useCsvImportProfiles', () => {
  it('loads global profiles and only reports save after the server confirms it', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profiles: [], revision: null }) })
      .mockImplementationOnce(async (_url: string, options: { body: string }) => {
        const data = JSON.parse(options.body) as { expected_revision: string | null; profiles: typeof customProfile[] }
        expect(data.expected_revision).toBeNull()
        expect(data.profiles).toMatchObject([customProfile])
        return { ok: true, json: async () => ({ profiles: data.profiles, revision: '2026-11-06T09:00:00Z' }) }
      })
    vi.stubGlobal('fetch', fetcher)
    const setCustomProfiles = vi.fn()
    const { result } = renderHook(() => useCsvImportProfiles([], setCustomProfiles))

    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => { await result.current.saveProfile(customProfile) })

    expect(setCustomProfiles).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'custom-profile', revision: 1 }),
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not report success or update local profiles after a 409', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ profiles: [], revision: null }) })
      .mockResolvedValueOnce({
        ok: false, json: async () => ({ detail: 'Revision conflict: reload profiles' }),
      })
    vi.stubGlobal('fetch', fetcher)
    const setCustomProfiles = vi.fn()
    const { result } = renderHook(() => useCsvImportProfiles([], setCustomProfiles))
    await waitFor(() => expect(result.current.ready).toBe(true))
    await expect(act(async () => { await result.current.saveProfile(customProfile) })).rejects.toThrow(/Revision conflict/)
    expect(setCustomProfiles).toHaveBeenCalledTimes(1)
  })
})
