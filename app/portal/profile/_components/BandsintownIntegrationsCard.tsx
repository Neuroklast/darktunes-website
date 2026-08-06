'use client'

/**
 * Portal Bandsintown credentials — same idea as admin ArtistForm fields,
 * scoped to the active artist / project.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowsClockwise, FloppyDisk, PlugsConnected } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPortalAuthHeaders } from '@/lib/portal/portalFetchAuth'

interface BandsintownIntegrationsCardProps {
  artistId: string
}

export function BandsintownIntegrationsCard({ artistId }: BandsintownIntegrationsCardProps) {
  const t = useTranslations('portal')
  const [bandsintownId, setBandsintownId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getPortalAuthHeaders()
      const res = await fetch(
        `/api/portal/integrations/bandsintown?artistId=${encodeURIComponent(artistId)}`,
        { headers },
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { bandsintownId?: string; hasApiKey?: boolean }
      setBandsintownId(data.bandsintownId ?? '')
      setHasApiKey(Boolean(data.hasApiKey))
      setApiKey('')
    } catch {
      toast.error(t('integrations_bandsintown_load_error'))
    } finally {
      setLoading(false)
    }
  }, [artistId, t])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      const headers = {
        ...(await getPortalAuthHeaders()),
        'Content-Type': 'application/json',
      }
      const body: { bandsintownId: string | null; bandsintownApiKey?: string } = {
        bandsintownId: bandsintownId.trim() || null,
      }
      if (apiKey.trim()) {
        body.bandsintownApiKey = apiKey.trim()
      }
      const res = await fetch(
        `/api/portal/integrations/bandsintown?artistId=${encodeURIComponent(artistId)}`,
        { method: 'PUT', headers, body: JSON.stringify(body) },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? 'save failed')
      }
      const data = (await res.json()) as { bandsintownId?: string; hasApiKey?: boolean }
      setBandsintownId(data.bandsintownId ?? '')
      setHasApiKey(Boolean(data.hasApiKey))
      setApiKey('')
      toast.success(t('integrations_bandsintown_save_success'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('integrations_bandsintown_save_error'))
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    if (!bandsintownId.trim()) {
      toast.error(t('integrations_bandsintown_missing_id'))
      return
    }
    if (!apiKey.trim() && !hasApiKey) {
      toast.error(t('integrations_bandsintown_missing_key'))
      return
    }
    setSyncing(true)
    try {
      const headers = {
        ...(await getPortalAuthHeaders()),
        'Content-Type': 'application/json',
      }
      const body: { bandsintownId: string; bandsintownApiKey?: string } = {
        bandsintownId: bandsintownId.trim(),
      }
      if (apiKey.trim()) body.bandsintownApiKey = apiKey.trim()

      const res = await fetch(
        `/api/portal/integrations/bandsintown/sync?artistId=${encodeURIComponent(artistId)}`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      )
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? t('integrations_bandsintown_sync_error'))
      }
      const data = (await res.json()) as { concertsUpserted?: number }
      const count = data.concertsUpserted ?? 0
      toast.success(t('integrations_bandsintown_sync_success', { count }))
      if (apiKey.trim()) {
        setHasApiKey(true)
        setApiKey('')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('integrations_bandsintown_sync_error'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PlugsConnected size={18} aria-hidden="true" />
          {t('integrations_bandsintown_title')}
        </CardTitle>
        <CardDescription>{t('integrations_bandsintown_description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('integrations_bandsintown_loading')}</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="portal-bandsintown-id">{t('integrations_bandsintown_id_label')}</Label>
              <Input
                id="portal-bandsintown-id"
                value={bandsintownId}
                onChange={(e) => setBandsintownId(e.target.value)}
                placeholder={t('integrations_bandsintown_id_placeholder')}
                autoComplete="off"
                disabled={saving || syncing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-bandsintown-key">{t('integrations_bandsintown_key_label')}</Label>
              <Input
                id="portal-bandsintown-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasApiKey
                    ? t('integrations_bandsintown_key_placeholder_set')
                    : t('integrations_bandsintown_key_placeholder')
                }
                autoComplete="new-password"
                disabled={saving || syncing}
              />
              {hasApiKey ? (
                <p className="text-xs text-muted-foreground">
                  {t('integrations_bandsintown_key_configured')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || syncing}
                className="min-h-[44px] gap-1.5"
              >
                <FloppyDisk size={16} aria-hidden="true" />
                {saving ? t('integrations_bandsintown_saving') : t('integrations_bandsintown_save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSync()}
                disabled={
                  saving ||
                  syncing ||
                  !bandsintownId.trim() ||
                  (!apiKey.trim() && !hasApiKey)
                }
                className="min-h-[44px] gap-1.5"
              >
                <ArrowsClockwise
                  size={16}
                  className={syncing ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {syncing
                  ? t('integrations_bandsintown_syncing')
                  : t('integrations_bandsintown_sync')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
