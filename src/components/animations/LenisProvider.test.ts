import { describe, expect, it } from 'vitest'
import { LENIS_OPTIONS, LENIS_WHEEL_LERP } from './LenisProvider'

describe('LENIS_OPTIONS', () => {
  it('uses lerp-only wheel smoothing so duration tweens cannot step each notch', () => {
    expect(LENIS_OPTIONS.lerp).toBe(LENIS_WHEEL_LERP)
    expect(LENIS_OPTIONS.smoothWheel).toBe(true)
    expect(LENIS_OPTIONS.autoRaf).toBe(true)
    expect('duration' in LENIS_OPTIONS).toBe(false)
    expect('easing' in LENIS_OPTIONS).toBe(false)
  })
})
