import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query.
 *
 * Returns `false` until the effect runs (SSR / first paint), so layout that
 * gates heavy desktop-only trees (e.g. `react-resizable-panels` with inline
 * `display: flex`) should treat `false` as the mobile-safe default.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Tailwind `lg` breakpoint (min-width: 1024px). */
export const LG_MEDIA_QUERY = '(min-width: 1024px)'

/** True when viewport is desktop-wide enough for multi-column builder chrome. */
export function useIsLg(): boolean {
  return useMediaQuery(LG_MEDIA_QUERY)
}
