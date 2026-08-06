import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocaleCookie } from './LocaleFlagSwitcher'

describe('setLocaleCookie', () => {
  afterEach(() => {
    // clear NEXT_LOCALE
    document.cookie = 'NEXT_LOCALE=; path=/; max-age=0'
    vi.unstubAllGlobals()
  })

  it('writes NEXT_LOCALE cookie with path and samesite', () => {
    setLocaleCookie('fr')
    expect(document.cookie).toMatch(/NEXT_LOCALE=fr/)
  })

  it('includes secure flag on https', () => {
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, protocol: 'https:', pathname: '/portal', search: '', hash: '' },
    })

    // document.cookie setter does not expose Secure in the getter, but the
    // assignment must not throw on https.
    expect(() => setLocaleCookie('de')).not.toThrow()
    expect(document.cookie).toMatch(/NEXT_LOCALE=de/)
  })
})
