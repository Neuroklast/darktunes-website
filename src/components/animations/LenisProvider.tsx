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
 * Public routes only. `syncTouch: false` so phones keep native touch scroll
 * (syncTouch caused rubber-band ghosting with VFX layers). Wheel/trackpad still
 * get smooth Lenis on desktop. Do not conditionally mount Lenis after media
 * queries — remounting the whole tree detaches focused elements and flakes e2e.
 */
const LENIS_OPTIONS = {
  lerp: 0.08,
  duration: 0.55,
  easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  syncTouch: false,
  wheelMultiplier: 0.9,
  touchMultiplier: 1,
  infinite: false,
  prevent: shouldPreventLenis,
} as const

export function LenisProvider({ children }: LenisProviderProps) {
  const pathname = usePathname()
  const onDashboard = isDashboardRoute(pathname)

  if (onDashboard) {
    return <>{children}</>
  }

  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      <ScrollLockObserver />
      {children}
    </ReactLenis>
  )
}
