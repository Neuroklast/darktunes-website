'use client'

/**
 * VisualEffectsOverlay
 *
 * Renders all overlay visual effects (vignette, CRT scanlines, film grain/noise,
 * chromatic aberration, colour wash) as a **single** `position: fixed` element
 * to minimise GPU compositor layers.
 *
 * Layer strategy:
 *  - Parent div  — vignette via `background` + `box-shadow: inset`
 *  - `::before`  — animated CRT scanlines (CSS class `vfx-scanlines` toggled)
 *  - `::after`   — film-grain noise (opacity controlled via CSS custom property)
 *
 * Dynamic CMS values are passed as CSS custom properties:
 *  --vfx-noise-opacity   : controls noise ::after opacity
 *  --vfx-vignette-shadow : full rgba value for box-shadow inset
 *  --vfx-vignette-grad   : reduced rgba value for radial-gradient background
 *  --fx-chromatic-offset : chromatic aberration drop-shadow offset
 *  --fx-wash-color       : colour wash overlay tint
 *  --fx-wash-opacity     : colour wash overlay opacity
 *
 * All overlays use pointer-events: none — they never block user interactions.
 * The CSS for ::before/::after lives in globals.css (.vfx-overlay).
 *
 * Mobile / coarse pointer: static vignette only — no scanline animation,
 * chromatic filters, or elevated grain (scroll ghosting / double-image).
 */

import { useEffect, useState } from 'react'
import type { ThemeEffects } from '@/config/themeConfig'

interface VisualEffectsOverlayProps {
  /** Opacity of the animated noise/grain layer (0–1). */
  noiseOpacity: number
  /** Whether the CRT scanline overlay is rendered. */
  crtScanlinesEnabled: boolean
  /** Opacity of the vignette radial gradient (0–1). */
  vignetteIntensity: number
  /** Full effects config for extended overlay effects. */
  effects?: ThemeEffects
}

function useIsCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mql = window.matchMedia('(pointer: coarse)')
    const update = () => setCoarse(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return coarse
}

export function VisualEffectsOverlay({
  noiseOpacity,
  crtScanlinesEnabled,
  vignetteIntensity,
  effects,
}: VisualEffectsOverlayProps) {
  const isCoarse = useIsCoarsePointer()
  const chromaticEnabled =
    !isCoarse && (effects?.overlay?.chromaticAberration?.enabled ?? false)
  const chromaticIntensity = effects?.overlay?.chromaticAberration?.intensity ?? 2
  const washEnabled = !isCoarse && (effects?.overlay?.colorWash?.enabled ?? false)
  const washColor = effects?.overlay?.colorWash?.color ?? 'transparent'
  const washOpacity = effects?.overlay?.colorWash?.opacity ?? 0
  const scanlines = !isCoarse && crtScanlinesEnabled
  const grainOpacity = isCoarse ? Math.min(noiseOpacity, 0.02) : noiseOpacity

  return (
    <>
      <div
        aria-hidden="true"
        className={`vfx-overlay${scanlines ? ' vfx-scanlines' : ''}${chromaticEnabled ? ' vfx-chromatic' : ''}${isCoarse ? ' vfx-mobile-lite' : ''}`}
        style={
          {
            '--vfx-noise-opacity': grainOpacity,
            '--vfx-vignette-shadow': `rgba(0,0,0,${vignetteIntensity})`,
            '--vfx-vignette-grad': `rgba(0,0,0,${(vignetteIntensity * 0.65).toFixed(3)})`,
            '--fx-chromatic-offset': chromaticEnabled ? `${chromaticIntensity}px` : '0px',
          } as React.CSSProperties
        }
      />
      {washEnabled && (
        <div
          aria-hidden="true"
          className="vfx-color-wash"
          style={
            {
              '--fx-wash-color': washColor,
              '--fx-wash-opacity': washOpacity,
            } as React.CSSProperties
          }
        />
      )}
    </>
  )
}
