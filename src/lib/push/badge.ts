/**
 * App icon badge helpers (Badging API).
 * Works on installed PWAs (Chrome/Android best; iOS limited).
 */

'use client'

export function isAppBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator
}

export async function setAppIconBadge(count: number): Promise<void> {
  if (!isAppBadgeSupported()) return
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (count <= 0) {
      await nav.clearAppBadge?.()
    } else {
      await nav.setAppBadge?.(count)
    }
  } catch {
    // Unsupported or permission denied — non-fatal
  }
}

export async function clearAppIconBadge(): Promise<void> {
  await setAppIconBadge(0)
}
