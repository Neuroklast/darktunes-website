'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ReactLenis, useLenis } from 'lenis/react'
import { isDashboardRoute } from '@/lib/scroll/dashboardRoutes'
import { shouldPreventLenis } from '@/lib/scroll/lenisPrevent'

export { useLenis }

interface LenisProviderProps {
  children: ReactNode
}

/** Absolute velocity above this marks the document as actively scrolling (VFX budget). */
const SCROLL_VELOCITY_THRESHOLD = 0.4
/** Clear `data-scrolling` after this idle window (ms). */
const SCROLL_IDLE_MS = 140

function ScrollLockObserver() {
  const lenis = useLenis()

  useEffect(() => {
    if (!lenis) return
    const observer = new MutationObserver(() => {
      if (document.body.dataset.scrollLocked === '1') {
        lenis.stop()
      } else {
        lenis.start()
      }
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-scroll-locked'],
    })
    return () => observer.disconnect()
  }, [lenis])

  return null
}

/**
 * Toggles `html[data-scrolling="1"]` while Lenis has velocity so CSS can
 * pause expensive VFX (grain, CRT pulse, chromatic) without unmounting Lenis.
 */
function ScrollFxController() {
  const lenis = useLenis()

  useEffect(() => {
    if (!lenis) return

    const root = document.documentElement
    let clearTimer: ReturnType<typeof setTimeout> | null = null

    const setScrolling = (on: boolean) => {
      if (on) {
        root.dataset.scrolling = '1'
      } else {
        delete root.dataset.scrolling
      }
    }

    const onScroll = (e: { velocity: number }) => {
      if (Math.abs(e.velocity) <= SCROLL_VELOCITY_THRESHOLD) return
      setScrolling(true)
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => setScrolling(false), SCROLL_IDLE_MS)
    }

    lenis.on('scroll', onScroll)
    return () => {
      lenis.off('scroll', onScroll)
      if (clearTimer) clearTimeout(clearTimer)
      delete root.dataset.scrolling
    }
  }, [lenis])

  return null
}

/**
 * Public routes only. Wheel must use **lerp only** — if `duration` + `easing`
 * are set, Lenis' animator prefers the timed ease and each mouse-wheel notch
 * restarts a 1s tween (feels stepped on Windows). Anchor clicks pass duration
 * separately via `LENIS_ANCHOR_SCROLL`.
 *
 * `syncTouch: false` so phones keep native touch scroll (syncTouch caused
 * rubber-band ghosting with VFX layers).
 *
 * `prevent` yields only to real nested scrollports — not carousels/grids.
 * Do not conditionally mount Lenis after media queries — remounting the tree
 * detaches focused elements and flakes e2e.
 */
export const LENIS_WHEEL_LERP = 0.08

export const LENIS_ANCHOR_SCROLL = {
  duration: 1.15,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
}

export const LENIS_OPTIONS = {
  lerp: LENIS_WHEEL_LERP,
  smoothWheel: true,
  autoRaf: true,
  syncTouch: false,
  wheelMultiplier: 0.9,
  touchMultiplier: 1,
  infinite: false,
  prevent: shouldPreventLenis,
}

export function LenisProvider({ children }: LenisProviderProps) {
  const pathname = usePathname()
  const onDashboard = isDashboardRoute(pathname)

  if (onDashboard) {
    return <>{children}</>
  }

  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      <ScrollLockObserver />
      <ScrollFxController />
      {children}
    </ReactLenis>
  )
}
