'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Info } from '@phosphor-icons/react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { getFeatureFlags } from '@/lib/api/featureFlags'
import { getClientOrganizationId } from '@/lib/organizations/clientOrganizationId'
import { useTranslations } from 'next-intl'
import { getErrorMessage } from '@/lib/clientErrors'
import type { ApiErrorResponse } from '@/lib/errors'
import { DEPRECATED_PORTAL_FEATURE_FLAGS } from '@/lib/pressAccess'
import {
  groupPortalFeatureFlags,
  portalFeatureFlagDescriptionKey,
} from '@/lib/portalFeatureFlagMeta'
import type { PortalFeatureFlag } from '@/types'

export function FeatureFlagsManager() {
  const t = useTranslations('admin.features')
  const tErrors = useTranslations('errors')
  const supabase = useMemo(() => createBrowserSupabaseClient(), [])
  const [flags, setFlags] = useState<PortalFeatureFlag[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const groupedFlags = useMemo(() => groupPortalFeatureFlags(flags), [flags])

  useEffect(() => {
    void getFeatureFlags(supabase, getClientOrganizationId())
      .then((rows) => setFlags(rows.filter((flag) => !DEPRECATED_PORTAL_FEATURE_FLAGS.has(flag.id))))
      .catch(() => toast.error(tErrors('SERVER_ERROR')))
  }, [supabase, tErrors])

  const toggleFlag = async (flag: PortalFeatureFlag, enabled: boolean) => {
    setLoadingId(flag.id)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error(tErrors('AUTH_REQUIRED'))

      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ enabled }),
      })

      if (!res.ok) {
        const body = (await res.json()) as ApiErrorResponse
        throw new Error(getErrorMessage(body, tErrors))
      }

      setFlags((prev) => prev.map((item) => (item.id === flag.id ? { ...item, enabled } : item)))
      toast.success(t('updatedToast', { label: flag.label }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors('SERVER_ERROR'))
    } finally {
      setLoadingId(null)
    }
  }

  const flagDescription = (flagId: string): string => {
    const key = portalFeatureFlagDescriptionKey(flagId)
    return t.has(key as Parameters<typeof t.has>[0]) ? t(key as Parameters<typeof t>[0]) : ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{t('portalHint')}</span>
      </div>

      {groupedFlags.length === 0 ? (
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          {t('noFlags')}
        </div>
      ) : (
        groupedFlags.map(({ role, flags: roleFlags }) => (
          <section key={role} className="space-y-2" aria-labelledby={`feature-group-${role}`}>
            <h3 id={`feature-group-${role}`} className="text-sm font-semibold text-foreground">
              {t(`groups.${role}`)}
            </h3>
            <div className="rounded-lg border border-border divide-y divide-border">
              {roleFlags.map((flag) => {
                const description = flagDescription(flag.id)
                return (
                  <div key={flag.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label htmlFor={`flag-${flag.id}`} className="font-medium cursor-pointer">
                          {flag.label}
                        </Label>
                        {!flag.enabled && (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            {t('disabledBadge')}
                          </Badge>
                        )}
                      </div>
                      {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                      )}
                      <code className="text-xs text-muted-foreground">{flag.id}</code>
                    </div>
                    <Switch
                      id={`flag-${flag.id}`}
                      checked={flag.enabled}
                      onCheckedChange={(checked) => void toggleFlag(flag, checked)}
                      disabled={loadingId === flag.id}
                      aria-label={t('toggleAria', { label: flag.label })}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}