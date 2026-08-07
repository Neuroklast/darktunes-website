'use client'

/**
 * Simple device-level push control for preferences pages.
 * One button: enable or disable on this browser — no technical jargon.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ensurePushSubscriptionSynced,
  getNotificationPermission,
  isPushSupported,
  subscribeToWebPush,
  unsubscribeFromWebPush,
} from '@/lib/push/client'

interface PushDeviceToggleProps {
  title: string
  description: string
  enableLabel: string
  disableLabel: string
  statusOn: string
  statusOff: string
  statusDenied: string
  statusUnsupported: string
}

type DeviceState = 'loading' | 'on' | 'off' | 'denied' | 'unsupported'

export function PushDeviceToggle({
  title,
  description,
  enableLabel,
  disableLabel,
  statusOn,
  statusOff,
  statusDenied,
  statusUnsupported,
}: PushDeviceToggleProps) {
  const [state, setState] = useState<DeviceState>('loading')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setState('unsupported')
      return
    }
    const permission = getNotificationPermission()
    if (permission === 'denied') {
      setState('denied')
      return
    }
    if (permission === 'granted') {
      await ensurePushSubscriptionSynced()
      setState('on')
      return
    }
    setState('off')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleEnable = async () => {
    setBusy(true)
    try {
      const result = await subscribeToWebPush()
      if (result.ok) setState('on')
      else if (result.reason === 'denied') setState('denied')
      else await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    setBusy(true)
    try {
      await unsubscribeFromWebPush()
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    state === 'on'
      ? statusOn
      : state === 'denied'
        ? statusDenied
        : state === 'unsupported'
          ? statusUnsupported
          : statusOff

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {state === 'loading' ? '…' : statusText}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {state === 'off' || state === 'loading' ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || state === 'loading'}
            onClick={() => void handleEnable()}
          >
            {enableLabel}
          </Button>
        ) : null}
        {state === 'on' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleDisable()}
          >
            {disableLabel}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
