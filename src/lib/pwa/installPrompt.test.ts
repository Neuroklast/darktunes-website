import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isStandaloneDisplayMode,
  PWA_INSTALL_DISMISSED_KEY,
  PWA_SHOW_INSTALL_EVENT,
  requestPwaInstallPrompt,
} from './installPrompt'

describe('requestPwaInstallPrompt', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('clears dismiss flag and dispatches show event', () => {
    localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, '1')
    const handler = vi.fn()
    window.addEventListener(PWA_SHOW_INSTALL_EVENT, handler)

    requestPwaInstallPrompt()

    expect(localStorage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener(PWA_SHOW_INSTALL_EVENT, handler)
  })
})

describe('isStandaloneDisplayMode', () => {
  it('returns a boolean without throwing', () => {
    expect(typeof isStandaloneDisplayMode()).toBe('boolean')
  })
})
