'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

interface PortalTermsGateProps {
  artistId: string
  termsVersion: string
}

export function PortalTermsGate({ artistId, termsVersion }: PortalTermsGateProps) {
  const t = useTranslations('portal')
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAccept = async () => {
    if (!accepted) {
      toast.error(t('onboarding_terms_checkbox'))
      return
    }
    setSaving(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error(t('profile_error'))

      const res = await fetch('/api/portal/accept-terms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ artist_id: artistId, accepted: true }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(json?.error ?? t('billing_error'))
      toast.success(t('portal_terms_accept'))
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('billing_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-terms-title"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl space-y-4"
      >
        <h2 id="portal-terms-title" className="text-xl font-bold">
          {t('portal_terms_gate_title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('portal_terms_gate_body')}</p>
        <p className="text-xs font-mono text-muted-foreground">
          {t('onboarding_step_terms')}: {termsVersion}
        </p>
        <Link
          href="/agb"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent underline underline-offset-2"
        >
          {t('onboarding_terms_link')}
        </Link>
        <div className="flex items-start gap-3 rounded-lg border border-border p-3">
          <Checkbox
            id="portal-terms-accept"
            checked={accepted}
            onCheckedChange={(c) => setAccepted(c === true)}
          />
          <Label htmlFor="portal-terms-accept" className="text-sm leading-snug cursor-pointer">
            {t('onboarding_terms_checkbox')}
          </Label>
        </div>
        <Button className="w-full" disabled={saving || !accepted} onClick={() => void handleAccept()}>
          {saving ? t('profile_saving') : t('portal_terms_accept')}
        </Button>
      </div>
    </div>
  )
}
