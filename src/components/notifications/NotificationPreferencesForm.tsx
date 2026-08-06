'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  ALL_NOTIFICATION_EVENT_TYPES,
  getUserNotificationPreferences,
  upsertNotificationPreferences,
  type NotificationPreference,
} from '@/lib/notifications'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface NotificationPreferencesFormProps {
  userId: string
  title: string
  description: string
  saveLabel: string
  savedLabel: string
  inAppLabel: string
  emailLabel: string
  /** Map event type → display label */
  typeLabels: Record<string, string>
}

export function NotificationPreferencesForm({
  userId,
  title,
  description,
  saveLabel,
  savedLabel,
  inAppLabel,
  emailLabel,
  typeLabels,
}: NotificationPreferencesFormProps) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [prefs, setPrefs] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getUserNotificationPreferences(supabase, userId)
      .then((rows) => {
        if (!cancelled) setPrefs(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setPrefs(
            ALL_NOTIFICATION_EVENT_TYPES.map((eventType) => ({
              eventType,
              inApp: true,
              email: true,
            })),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  const updatePref = useCallback(
    (eventType: string, patch: Partial<Pick<NotificationPreference, 'inApp' | 'email'>>) => {
      setPrefs((prev) =>
        prev.map((p) => (p.eventType === eventType ? { ...p, ...patch } : p)),
      )
      setSaved(false)
    },
    [],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await upsertNotificationPreferences(
        supabase,
        userId,
        prefs.map((p) => ({
          eventType: p.eventType,
          inApp: p.inApp,
          email: p.email,
        })),
      )
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">…</p>
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>

      <div
        className="overflow-x-auto overflow-y-clip overscroll-x-contain rounded-md border border-border"
        data-lenis-prevent
      >
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Event</th>
              <th className="px-3 py-2 text-center font-medium">{inAppLabel}</th>
              <th className="px-3 py-2 text-center font-medium">{emailLabel}</th>
            </tr>
          </thead>
          <tbody>
            {prefs.map((pref) => (
              <tr key={pref.eventType} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  {typeLabels[pref.eventType] ?? pref.eventType}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={pref.inApp}
                    onChange={(e) => updatePref(pref.eventType, { inApp: e.target.checked })}
                    aria-label={`${typeLabels[pref.eventType] ?? pref.eventType} ${inAppLabel}`}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={pref.email}
                    onChange={(e) => updatePref(pref.eventType, { email: e.target.checked })}
                    aria-label={`${typeLabels[pref.eventType] ?? pref.eventType} ${emailLabel}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saveLabel}
        </Button>
        {saved ? <Label className="text-sm text-muted-foreground">{savedLabel}</Label> : null}
      </div>
    </div>
  )
}
