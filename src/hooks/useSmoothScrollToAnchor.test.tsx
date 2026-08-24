import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSmoothScrollToAnchor } from './useSmoothScrollToAnchor'

const { mockLenis, mockScrollTo, lenisState } = vi.hoisted(() => ({
  mockLenis: { scrollTo: vi.fn() },
  mockScrollTo: vi.fn(),
  lenisState: { current: null as { scrollTo: (href: string, opts: { offset: number }) => void } | null },
}))

vi.mock('@/components/animations/LenisProvider', () => ({
  useLenis: () => lenisState.current,
  LENIS_ANCHOR_SCROLL: {
    duration: 1.15,
    easing: (t: number) => t,
  },
}))

describe('useSmoothScrollToAnchor', () => {
  it('uses Lenis when available', () => {
    lenisState.current = mockLenis
    const { result } = renderHook(() => useSmoothScrollToAnchor())
    const preventDefault = vi.fn()

    result.current({ preventDefault } as unknown as React.MouseEvent<HTMLElement>, '#target')

    expect(preventDefault).toHaveBeenCalled()
    expect(mockLenis.scrollTo).toHaveBeenCalledWith('#target', {
      offset: -140,
      duration: 1.15,
      easing: expect.any(Function),
    })
  })

  it('falls back to native scroll when Lenis is unavailable', async () => {
    lenisState.current = null
    const target = document.createElement('div')
    target.id = 'target'
    document.body.appendChild(target)
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    Object.defineProperty(window, 'scrollY', { value: 20, writable: true })
    vi.stubGlobal('scrollTo', mockScrollTo)

    const { result } = renderHook(() => useSmoothScrollToAnchor())
    result.current({ preventDefault: vi.fn() } as unknown as React.MouseEvent<HTMLElement>, '#target')

    expect(mockScrollTo).toHaveBeenCalledWith({ top: -20, behavior: 'smooth' })
  })
})
