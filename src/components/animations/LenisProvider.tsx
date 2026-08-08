'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ReactLenis, useLenis } from 'lenis/react'
import { isDashboardRoute } from '@/lib/scroll/dashboardRoutes'
import { shouldPreventLenis } from '@/lib/scroll/lenisPrevent'

export { useLenis }

interface LenisProviderProps {
  children: ReactNode
}

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
 * Desktop / fine-pointer: Lenis smooth wheel scroll.
 * Coarse pointer (phones/tablets): native scroll only — Lenis syncTouch causes
 * rubber-band ghosting / doubled frames with GPU layers (VFX, will-change).
 */
const LENIS_DESKTOP_OPTIONS = {
  lerp: 0.08,
  duration: 0.55,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  syncTouch: false,
  wheelMultiplier: 0.9,
  touchMultiplier: 1,
  infinite: false,
  prevent: shouldPreventLenis,
} as const

function usePreferNativeScroll(): boolean {
  const [preferNative, setPreferNative] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const coarse = window.matchMedia('(pointer: coarse)')
    const update = () => setPreferNative(coarse.matches)
    update()
    coarse.addEventListener('change', update)
    return () => coarse.removeEventListener('change', update)
  }, [])

  return preferNative
}

export function LenisProvider({ children }: LenisProviderProps) {
  const pathname = usePathname()
  const onDashboard = isDashboardRoute(pathname)
  const preferNativeScroll = usePreferNativeScroll()

  if (onDashboard || preferNativeScroll) {
    return <>{children}</>
  }

  return (
    <ReactLenis root options={LENIS_DESKTOP_OPTIONS}>
      <ScrollLockObserver />
      {children}
    </ReactLenis>
  )
}