'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  isBillingProfileComplete,
  type ArtistBillingProfile,
} from '@/lib/api/artistBillingProfiles'
import type { TaxStatus } from '@/lib/legal/taxStatus'

interface InlineBillingProfileStepProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  onComplete: (profile: ArtistBillingProfile) => void
}

export function InlineBillingProfileStep({
  artistId,
  billingProfile,
  onComplete,
}: InlineBillingProfileStepProps) {
  const t = useTranslations('portal')

  const [form, setForm] = useState({
    legalName: billingProfile?.legalName ?? '',
    street: billingProfile?.street ?? '',
    postalCode: billingProfile?.postalCode ?? '',
    city: billingProfile?.city ?? '',
    country: billingProfile?.country ?? 'DE',
    taxNumber: billingProfile?.taxNumber ?? '',
    vatId: billingProfile?.vatId ?? '',
    taxStatus: (billingProfile?.taxStatus ?? 'standard') as TaxStatus,
  })
  const [saving, setSaving] = useState(false)

  const updateField = (field: keyof typeof form, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)

    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error(t('profile_error'))

      const response = await fetch('/api/portal/billing-profile', {
        method: 'POST',
        headers: {
          Authorization: ['Bearer', session.access_token].join(' '),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artistId,
          legal_name: form.legalName,
          street: form.street,
          postal_code: form.postalCode,
          city: form.city,
          country: form.country,
          tax_number: form.taxNumber,
          vat_id: form.vatId,
          tax_status: form.taxStatus,
          is_small_business: form.taxStatus === 'small_business',
        }),
      })

      const json = (await response.json().catch(() => null)) as
        | { error?: string; profile?: ArtistBillingProfile }
        | null

      if (!response.ok || !json?.profile) {
        throw new Error(json?.error ?? t('billing_error'))
      }

      if (!isBillingProfileComplete(json.profile)) {
        toast.error(t('invoice_billing_incomplete'))
        return
      }

      toast.success(t('billing_saved'))
      onComplete(json.profile)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('billing_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <WarningCircle size={18} className="text-amber-300" aria-hidden="true" />
          {t('invoice_billing_inline_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{t('invoice_billing_inline_desc')}</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="inline-billing-legal-name">{t('billing_legal_name')}</Label>
              <Input
                id="inline-billing-legal-name"
                required
                value={form.legalName}
                onChange={(event) => updateField('legalName', event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="inline-billing-street">{t('billing_street')}</Label>
              <Input
                id="inline-billing-street"
                required
                value={form.street}
                onChange={(event) => updateField('street', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-billing-postal">{t('billing_postal_code')}</Label>
              <Input
                id="inline-billing-postal"
                required
                value={form.postalCode}
                onChange={(event) => updateField('postalCode', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-billing-city">{t('billing_city')}</Label>
              <Input
                id="inline-billing-city"
                required
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-billing-country">{t('billing_country')}</Label>
              <Input
                id="inline-billing-country"
                required
                value={form.country}
                onChange={(event) => updateField('country', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-billing-tax">{t('billing_tax_number')}</Label>
              <Input
                id="inline-billing-tax"
                value={form.taxNumber}
                onChange={(event) => updateField('taxNumber', event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="inline-billing-vat">{t('billing_vat_id')}</Label>
              <Input
                id="inline-billing-vat"
                value={form.vatId}
                onChange={(event) => updateField('vatId', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inline-billing-tax-status">{t('billing_tax_status')}</Label>
            <select
              id="inline-billing-tax-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.taxStatus}
              onChange={(event) => updateField('taxStatus', event.target.value as TaxStatus)}
            >
              <option value="standard">{t('billing_tax_standard')}</option>
              <option value="small_business">{t('billing_tax_small_business')}</option>
              <option value="reverse_charge">{t('billing_tax_reverse_charge')}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">{t('billing_completeness_hint')}</p>
            <Button type="submit" disabled={saving || !artistId} className="gap-2">
              <CheckCircle size={16} aria-hidden="true" />
              {saving ? t('billing_save') : t('invoice_billing_continue')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}