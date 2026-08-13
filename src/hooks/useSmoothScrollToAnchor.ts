'use client'

/**
 * src/hooks/useSmoothScrollToAnchor.ts
 *
 * Returns a stable event handler that scrolls to an anchor element.
 *
 * When Lenis is available it delegates to `lenis.scrollTo()` for the smooth
 * scroll animation; otherwise it falls back to the native `window.scrollTo()`
 * with `behavior: 'smooth'` and a manual offset calculation.
 *
 * Usage:
 *   const handleScroll = useSmoothScrollToAnchor()
 *   <a onClick={(e) => handleScroll(e, '#section')}>…</a>
 */

import { useCallback } from 'react'
import { LENIS_ANCHOR_SCROLL, useLenis } from '@/components/animations/LenisProvider'

const HEADER_OFFSET = 140

export function useSmoothScrollToAnchor() {
  const lenis = useLenis()

  return useCallback(
    (e: React.MouseEvent<HTMLElement>, href: string) => {
      e.preventDefault()
      if (lenis) {
        lenis.scrollTo(href, { offset: -HEADER_OFFSET, ...LENIS_ANCHOR_SCROLL })
      } else {
        const target = document.querySelector(href)
        if (target) {
          const offsetPosition =
            target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
        }
      }
    },
    [lenis],
  )
}
