'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GuidedStepShell } from '@/components/guided/GuidedStepShell'
import { GuidedModeChooser } from '@/components/guided/GuidedModeChooser'
import {
  isBillingProfileComplete,
  isBillingProfileSepaReady,
  type ArtistBillingProfile,
} from '@/lib/api/artistBillingProfiles'
import type { TaxStatus } from '@/lib/legal/taxStatus'
import { isValidIBAN, sanitiseIBAN } from '@/lib/sos/iban-validator'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { GuidedMode, GuidedStepDef } from '@/lib/guided/guidedSteps'
import { BillingProfileForm } from './BillingProfileForm'

const STEPS: readonly GuidedStepDef[] = [
  { id: 'legal', label: 'Legal' },
  { id: 'tax', label: 'Tax' },
  { id: 'payout', label: 'Payout' },
  { id: 'done', label: 'Done' },
]

interface BillingProfileAssistantProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  isComplete: boolean
  /** When true, start in assistant without chooser. */
  forceAssistant?: boolean
}

export function BillingProfileAssistant({
  artistId,
  billingProfile: initial,
  isComplete: initialComplete,
  forceAssistant = false,
}: BillingProfileAssistantProps) {
  const t = useTranslations('portal')
  const [mode, setMode] = useState<GuidedMode | null>(
    forceAssistant || !initialComplete ? 'assistant' : null,
  )
  const [stepId, setStepId] = useState('legal')
  const [maxReachable, setMaxReachable] = useState(0)
  const [profile, setProfile] = useState(initial)
  const [complete, setComplete] = useState(initialComplete)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    legalName: initial?.legalName ?? '',
    street: initial?.street ?? '',
    postalCode: initial?.postalCode ?? '',
    city: initial?.city ?? '',
    country: initial?.country ?? 'DE',
    taxNumber: initial?.taxNumber ?? '',
    vatId: initial?.vatId ?? '',
    taxStatus: (initial?.taxStatus ?? 'standard') as TaxStatus,
    iban: initial?.iban ?? '',
    bic: initial?.bic ?? '',
    paypalEmail: initial?.paypalEmail ?? '',
  })

  const ibanClean = sanitiseIBAN(form.iban)
  const ibanValid = ibanClean.length === 0 || isValidIBAN(ibanClean)
  const sepaReady = isBillingProfileSepaReady(
    profile
      ? { ...profile, iban: form.iban, legalName: form.legalName }
      : {
          id: '',
          artistId,
          legalName: form.legalName,
          street: form.street,
          postalCode: form.postalCode,
          city: form.city,
          country: form.country,
          taxNumber: form.taxNumber || undefined,
          vatId: form.vatId || undefined,
          isSmallBusiness: form.taxStatus === 'small_business',
          taxStatus: form.taxStatus,
          iban: form.iban || undefined,
          bic: form.bic || undefined,
          paypalEmail: form.paypalEmail || undefined,
          vatViesValid: null,
          vatViesCheckedAt: null,
          vatViesTraderName: null,
          vatViesRequestId: null,
          createdAt: '',
          updatedAt: '',
        },
    { ibanValid: ibanClean.length > 0 ? ibanValid : false },
  )

  const legalOk =
    form.legalName.trim() &&
    form.street.trim() &&
    form.postalCode.trim() &&
    form.city.trim() &&
    form.country.trim()
  const taxOk =
    form.taxStatus === 'reverse_charge'
      ? Boolean(form.vatId.trim())
      : Boolean(form.taxNumber.trim() || form.vatId.trim())
  const payoutOk = ibanClean.length === 0 || ibanValid

  const stepComplete = useMemo(() => {
    if (stepId === 'legal') return Boolean(legalOk)
    if (stepId === 'tax') return taxOk
    if (stepId === 'payout') return payoutOk
    return true
  }, [stepId, legalOk, taxOk, payoutOk])

  const blockedReason = useMemo(() => {
    if (stepComplete) return null
    if (stepId === 'legal') return t('billing_assistant_need_legal')
    if (stepId === 'tax') return t('billing_assistant_need_tax')
    if (stepId === 'payout') return t('billing_assistant_need_iban_valid')
    return null
  }, [stepComplete, stepId, t])

  const saveProfile = async (): Promise<ArtistBillingProfile | null> => {
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
          Authorization: `Bearer ${session.access_token}`,
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
          iban: form.iban ? sanitiseIBAN(form.iban) : '',
          bic: form.bic,
          paypal_email: form.paypalEmail,
        }),
      })
      const json = (await response.json().catch(() => null)) as {
        error?: string
        profile?: ArtistBillingProfile
        isComplete?: boolean
        vies?: { status?: string; valid?: boolean; traderName?: string; message?: string } | null
      } | null
      if (!response.ok || !json?.profile) {
        throw new Error(json?.error ?? t('billing_error'))
      }
      setProfile(json.profile)
      setComplete(json.isComplete ?? isBillingProfileComplete(json.profile))
      toast.success(t('billing_saved'))
      if (json.vies?.status === 'valid') {
        toast.message(
          json.vies.traderName
            ? `${t('billing_vies_valid')}: ${json.vies.traderName}`
            : t('billing_vies_valid'),
        )
      } else if (json.vies?.status === 'invalid') {
        toast.warning(json.vies.message ?? t('billing_vies_invalid'))
      } else if (json.vies?.status === 'service_unavailable') {
        toast.warning(t('billing_vies_unavailable'))
      }
      return json.profile
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('billing_error'))
      return null
    } finally {
      setSaving(false)
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === stepId)

  const goNext = async () => {
    if (stepId === 'done') {
      setMode('advanced')
      return
    }
    // Persist when leaving tax (invoice-ready) and payout (full)
    if (stepId === 'tax' || stepId === 'payout') {
      const saved = await saveProfile()
      if (!saved) return
    }
    const next = STEPS[stepIndex + 1]
    if (next) {
      setStepId(next.id)
      setMaxReachable((m) => Math.max(m, stepIndex + 1))
    }
  }

  const goBack = () => {
    if (stepIndex <= 0) return
    const prev = STEPS[stepIndex - 1]
    if (prev) setStepId(prev.id)
  }

  if (mode === null) {
    return (
      <GuidedModeChooser
        title={t('billing_assistant_mode_title')}
        subtitle={t('billing_assistant_mode_subtitle')}
        recommendedLabel={t('guided_recommended')}
        assistantTitle={t('billing_assistant_mode_assistant_title')}
        assistantDesc={t('billing_assistant_mode_assistant_desc')}
        assistantButton={t('billing_assistant_mode_assistant_btn')}
        advancedTitle={t('billing_assistant_mode_advanced_title')}
        advancedDesc={t('billing_assistant_mode_advanced_desc')}
        advancedButton={t('billing_assistant_mode_advanced_btn')}
        whatNextTitle={t('billing_assistant_what_next_title')}
        whatNextSteps={[
          t('billing_assistant_what_next_1'),
          t('billing_assistant_what_next_2'),
          t('billing_assistant_what_next_3'),
          t('billing_assistant_what_next_4'),
        ]}
        onSelect={setMode}
      />
    )
  }

  if (mode === 'advanced') {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setMode('assistant')}>
            {t('guided_open_assistant')}
          </Button>
        </div>
        <BillingProfileForm
          artistId={artistId}
          billingProfile={profile}
          isComplete={complete}
        />
      </div>
    )
  }

  const coach = coachCopy(stepId, t, {
    complete,
    sepaReady: sepaReady && ibanClean.length > 0 && ibanValid,
  })

  return (
    <GuidedStepShell
      steps={STEPS.map((s) => ({
        ...s,
        label:
          s.id === 'legal'
            ? t('billing_assistant_step_legal')
            : s.id === 'tax'
              ? t('billing_assistant_step_tax')
              : s.id === 'payout'
                ? t('billing_assistant_step_payout')
                : t('billing_assistant_step_done'),
      }))}
      activeStepId={stepId}
      onStepChange={(id) => setStepId(id)}
      maxReachableIndex={maxReachable}
      coachTitle={coach.title}
      coachBody={coach.body}
      coachChecks={coach.checks}
      blockedReason={blockedReason}
      canContinue={stepComplete && !saving}
      onBack={goBack}
      onNext={() => void goNext()}
      nextLabel={
        stepId === 'done'
          ? t('billing_assistant_finish')
          : stepId === 'payout'
            ? t('billing_assistant_save_continue')
            : t('guided_continue')
      }
      isLastStep={stepId === 'done'}
      onSwitchToAdvanced={() => setMode('advanced')}
      switchAdvancedLabel={t('guided_switch_advanced')}
      backLabel={t('guided_back')}
    >
      {stepId === 'legal' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('billing_assistant_step_legal')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="legalName"
              label={t('billing_legal_name')}
              value={form.legalName}
              onChange={(v) => setForm((f) => ({ ...f, legalName: v }))}
              className="sm:col-span-2"
            />
            <Field
              id="street"
              label={t('billing_street')}
              value={form.street}
              onChange={(v) => setForm((f) => ({ ...f, street: v }))}
              className="sm:col-span-2"
            />
            <Field
              id="postalCode"
              label={t('billing_postal_code')}
              value={form.postalCode}
              onChange={(v) => setForm((f) => ({ ...f, postalCode: v }))}
            />
            <Field
              id="city"
              label={t('billing_city')}
              value={form.city}
              onChange={(v) => setForm((f) => ({ ...f, city: v }))}
            />
            <Field
              id="country"
              label={t('billing_country')}
              value={form.country}
              onChange={(v) => setForm((f) => ({ ...f, country: v }))}
            />
          </CardContent>
        </Card>
      )}

      {stepId === 'tax' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('billing_assistant_step_tax')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="taxNumber"
              label={t('billing_tax_number')}
              value={form.taxNumber}
              onChange={(v) => setForm((f) => ({ ...f, taxNumber: v }))}
            />
            <Field
              id="vatId"
              label={t('billing_vat_id')}
              value={form.vatId}
              onChange={(v) => setForm((f) => ({ ...f, vatId: v }))}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="taxStatus">{t('billing_tax_status')}</Label>
              <select
                id="taxStatus"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.taxStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, taxStatus: e.target.value as TaxStatus }))
                }
              >
                <option value="standard">{t('billing_tax_standard')}</option>
                <option value="small_business">{t('billing_tax_small_business')}</option>
                <option value="reverse_charge">{t('billing_tax_reverse_charge')}</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t('billing_tax_status_hint')}</p>
          </CardContent>
        </Card>
      )}

      {stepId === 'payout' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('billing_assistant_step_payout')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="iban"
              label={t('billing_iban')}
              value={form.iban}
              onChange={(v) => setForm((f) => ({ ...f, iban: v }))}
              className="sm:col-span-2 font-mono"
            />
            {!ibanValid && form.iban.trim() ? (
              <p className="text-xs text-destructive sm:col-span-2" role="alert">
                {t('billing_assistant_need_iban_valid')}
              </p>
            ) : null}
            <Field
              id="bic"
              label={t('billing_bic')}
              value={form.bic}
              onChange={(v) => setForm((f) => ({ ...f, bic: v }))}
            />
            <Field
              id="paypal"
              label={t('billing_paypal')}
              value={form.paypalEmail}
              onChange={(v) => setForm((f) => ({ ...f, paypalEmail: v }))}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">{t('billing_assistant_payout_hint')}</p>
          </CardContent>
        </Card>
      )}

      {stepId === 'done' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-2">
              {complete ? (
                <CheckCircle size={20} className="text-emerald-400 shrink-0" weight="fill" />
              ) : (
                <WarningCircle size={20} className="text-amber-400 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {complete ? t('billing_assistant_invoice_ready') : t('billing_assistant_invoice_not_ready')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sepaReady && ibanClean
                    ? t('billing_assistant_sepa_ready')
                    : t('billing_assistant_sepa_not_ready')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/portal/invoices">{t('billing_assistant_go_invoices')}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/portal/statements">{t('billing_assistant_go_statements')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </GuidedStepShell>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  className,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function coachCopy(
  stepId: string,
  t: ReturnType<typeof useTranslations<'portal'>>,
  state: { complete: boolean; sepaReady: boolean },
) {
  if (stepId === 'legal') {
    return {
      title: t('billing_assistant_coach_legal_title'),
      body: t('billing_assistant_coach_legal_body'),
      checks: [{ id: 'legal', label: t('billing_assistant_check_legal'), done: false }],
    }
  }
  if (stepId === 'tax') {
    return {
      title: t('billing_assistant_coach_tax_title'),
      body: t('billing_assistant_coach_tax_body'),
      checks: [{ id: 'tax', label: t('billing_assistant_check_tax'), done: false }],
    }
  }
  if (stepId === 'payout') {
    return {
      title: t('billing_assistant_coach_payout_title'),
      body: t('billing_assistant_coach_payout_body'),
      checks: [{ id: 'iban', label: t('billing_assistant_check_iban'), done: state.sepaReady }],
    }
  }
  return {
    title: t('billing_assistant_coach_done_title'),
    body: t('billing_assistant_coach_done_body'),
    checks: [
      { id: 'inv', label: t('billing_assistant_check_invoice_ready'), done: state.complete },
      { id: 'sepa', label: t('billing_assistant_check_sepa_ready'), done: state.sepaReady },
    ],
  }
}
