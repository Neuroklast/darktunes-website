'use client'

/**
 * Zero-config Web Push for portal + admin.
 *
 * - If permission already granted → silently re-sync subscription
 * - If default → one soft banner: Enable / Not now
 * - Syncs app icon badge whenever `badgeCount` changes
 *
 * Users never configure VAPID, endpoints, or technical details.
 */

import { useCallback, useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setAppIconBadge } from '@/lib/push/badge'
import {
  dismissPushEnableBanner,
  ensurePushSubscriptionSynced,
  getNotificationPermission,
  isPushEnableDismissed,
  isPushSupported,
  subscribeToWebPush,
} from '@/lib/push/client'

export interface PushBootstrapProps {
  /** Total unread items for the app icon badge */
  badgeCount: number
  /** When false, skip subscribe UI (e.g. not logged in) */
  enabled?: boolean
  title: string
  description: string
  enableLabel: string
  laterLabel: string
  enabledToast?: string
}

export function PushBootstrap({
  badgeCount,
  enabled = true,
  title,
  description,
  enableLabel,
  laterLabel,
  enabledToast,
}: PushBootstrapProps) {
  const [showBanner, setShowBanner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [statusHint, setStatusHint] = useState<string | null>(null)

  // App icon badge — always keep in sync when counts change
  useEffect(() => {
    if (!enabled) return
    void setAppIconBadge(badgeCount)
  }, [badgeCount, enabled])

  // Silent re-subscribe when already granted; soft banner otherwise
  useEffect(() => {
    if (!enabled) return
    if (!isPushSupported()) return

    let cancelled = false

    const run = async () => {
      const permission = getNotificationPermission()
      if (permission === 'granted') {
        await ensurePushSubscriptionSynced()
        if (!cancelled) setShowBanner(false)
        return
      }
      if (permission === 'denied' || permission === 'unsupported') {
        if (!cancelled) setShowBanner(false)
        return
      }
      // default — show soft enable once (unless dismissed)
      if (!isPushEnableDismissed() && !cancelled) {
        setShowBanner(true)
      }
    }

    // Defer slightly so login / SW registration can settle
    const t = window.setTimeout(() => {
      void run()
    }, 1200)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [enabled])

  const handleEnable = useCallback(async () => {
    setBusy(true)
    setStatusHint(null)
    try {
      const result = await subscribeToWebPush()
      if (result.ok) {
        setShowBanner(false)
        if (enabledToast) setStatusHint(enabledToast)
        void setAppIconBadge(badgeCount)
      } else if (result.reason === 'denied') {
        setShowBanner(false)
      } else if (result.reason === 'no_service_worker') {
        // Production SW required; hide to avoid nagging in local dev without SW
        setShowBanner(false)
      } else if (result.reason === 'not_configured') {
        setShowBanner(false)
      }
    } finally {
      setBusy(false)
    }
  }, [badgeCount, enabledToast])

  const handleLater = useCallback(() => {
    dismissPushEnableBanner()
    setShowBanner(false)
  }, [])

  if (!enabled) return null

  return (
    <>
      {statusHint ? (
        <p className="sr-only" role="status">
          {statusHint}
        </p>
      ) : null}

      {showBanner ? (
        <div
          className="fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-md rounded-lg border border-border bg-card p-4 shadow-lg sm:left-auto sm:right-4"
          role="dialog"
          aria-labelledby="push-enable-title"
          aria-describedby="push-enable-desc"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary" aria-hidden>
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p id="push-enable-title" className="text-sm font-semibold text-foreground">
                {title}
              </p>
              <p id="push-enable-desc" className="mt-1 text-xs text-muted-foreground">
                {description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleEnable()}
                >
                  {enableLabel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={handleLater}
                >
                  {laterLabel}
                </Button>
              </div>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={laterLabel}
              onClick={handleLater}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
