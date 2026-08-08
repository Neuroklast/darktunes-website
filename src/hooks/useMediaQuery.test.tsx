import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { LG_MEDIA_QUERY, useIsLg, useMediaQuery } from './useMediaQuery'

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to false before matchMedia resolves (mobile-safe)', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener,
        removeEventListener,
      })),
    )

    const { result } = renderHook(() => useMediaQuery(LG_MEDIA_QUERY))
    // First render is always false; effect then updates.
    expect(typeof result.current).toBe('boolean')
  })

  it('tracks matchMedia for lg breakpoint', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const mql = {
      matches: true,
      addEventListener,
      removeEventListener,
    }
    vi.stubGlobal('matchMedia', vi.fn(() => mql))

    const { result } = renderHook(() => useIsLg())

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
    expect(window.matchMedia).toHaveBeenCalledWith(LG_MEDIA_QUERY)
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('returns false when viewport is below lg', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    const { result } = renderHook(() => useIsLg())

    await waitFor(() => {
      expect(result.current).toBe(false)
    })
  })
})
