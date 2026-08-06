/**
 * PWA install prompt helpers — shared dismiss key + manual re-show event.
 */

export const PWA_INSTALL_DISMISSED_KEY = 'pwa-install-dismissed'
export const PWA_SHOW_INSTALL_EVENT = 'pwa:show-install'

/** Clear dismiss flag and ask PWAInstallPrompt to show again. */
export function requestPwaInstallPrompt(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY)
  } catch {
    // private mode / blocked storage — still dispatch event
  }
  window.dispatchEvent(new CustomEvent(PWA_SHOW_INSTALL_EVENT))
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      return true
    }
  } catch {
    // jsdom / restricted environments
  }
  // iOS Safari
  return (
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}
