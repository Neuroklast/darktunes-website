'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateField } from '@/components/ui/date-field'
import { GuidedStepShell } from '@/components/guided/GuidedStepShell'
import {
  DEFAULT_INVOICE_DUE_DAYS,
  DEFAULT_TAX_RATE_PCT,
} from '@/lib/analytics/constants'
import {
  isBillingProfileComplete,
  type ArtistBillingProfile,
} from '@/lib/api/artistBillingProfiles'
import type { ArtistInvoice } from '@/lib/api/artistInvoices'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { LabelClientInfo } from '@/lib/portal/labelBilling'
import { taxRateForStatus } from '@/lib/legal/taxStatus'
import { isInvoiceableStatementStatus, type GuidedStepDef } from '@/lib/guided/guidedSteps'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { InlineBillingProfileStep } from './InlineBillingProfileStep'
import Link from 'next/link'

const STEPS: readonly GuidedStepDef[] = [
  { id: 'confirm', label: 'Confirm' },
  { id: 'billing', label: 'Billing' },
  { id: 'review', label: 'Send' },
]

function dueDateFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function defaultArtistInvoiceNumber(period: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `SOS-${period}-${stamp}`
}

export interface InvoiceFromStatementAssistantProps {
  artistId: string
  statement: SalesStatement
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  labelClient: LabelClientInfo
  onSuccess: (invoice: ArtistInvoice) => void
  onCancel: () => void
}

export function InvoiceFromStatementAssistant({
  artistId,
  statement,
  billingProfile: initialBilling,
  billingProfileComplete: initialComplete,
  labelClient,
  onSuccess,
  onCancel,
}: InvoiceFromStatementAssistantProps) {
  const t = useTranslations('portal')
  const [stepId, setStepId] = useState('confirm')
  const [maxReachable, setMaxReachable] = useState(0)
  const [billingProfile, setBillingProfile] = useState(initialBilling)
  const [billingComplete, setBillingComplete] = useState(initialComplete)
  const [invoiceNumber, setInvoiceNumber] = useState(defaultArtistInvoiceNumber(statement.period))
  const [dueDate, setDueDate] = useState(dueDateFromNow(DEFAULT_INVOICE_DUE_DAYS))
  const [sendEmail, setSendEmail] = useState(true)
  const [sendToLabel, setSendToLabel] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const amountEur = statement.amountEur ?? 0
  const amountCents = Math.round(amountEur * 100)
  const invoiceable = isInvoiceableStatementStatus(statement.status) && amountEur > 0
  const taxRate = taxRateForStatus(
    billingProfile?.taxStatus ?? (billingProfile?.isSmallBusiness ? 'small_business' : 'standard'),
    DEFAULT_TAX_RATE_PCT,
  )

  const stepComplete = useMemo(() => {
    if (stepId === 'confirm') return invoiceable
    if (stepId === 'billing') return billingComplete
    if (stepId === 'review') return Boolean(invoiceNumber.trim() && dueDate)
    return false
  }, [stepId, invoiceable, billingComplete, invoiceNumber, dueDate])

  const blockedReason = useMemo(() => {
    if (stepComplete) return null
    if (stepId === 'confirm') return t('invoice_assistant_need_statement')
    if (stepId === 'billing') return t('invoice_billing_incomplete')
    if (stepId === 'review') return t('invoice_assistant_need_review')
    return null
  }, [stepComplete, stepId, t])

  const stepIndex = STEPS.findIndex((s) => s.id === stepId)

  // Skip billing step when already complete
  const effectiveSteps = useMemo(() => {
    if (billingComplete && stepId !== 'billing') {
      return STEPS.filter((s) => s.id !== 'billing')
    }
    return STEPS
  }, [billingComplete, stepId])

  const goNext = async () => {
    if (stepId === 'review') {
      await submitInvoice()
      return
    }
    let nextId: string | undefined
    if (stepId === 'confirm') {
      nextId = billingComplete ? 'review' : 'billing'
    } else if (stepId === 'billing') {
      nextId = 'review'
    }
    if (nextId) {
      setStepId(nextId)
      const idx = STEPS.findIndex((s) => s.id === nextId)
      setMaxReachable((m) => Math.max(m, idx))
    }
  }

  const goBack = () => {
    if (stepId === 'review') {
      setStepId(billingComplete ? 'confirm' : 'billing')
      return
    }
    if (stepId === 'billing') setStepId('confirm')
  }

  const submitInvoice = async () => {
    setSubmitting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error(t('profile_error'))

      const response = await fetch('/api/portal/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artistId,
          artist_invoice_number: invoiceNumber.trim(),
          client_name: labelClient.name,
          client_email: labelClient.email,
          client_address: labelClient.address,
          statement_id: statement.id,
          line_items: [
            {
              description: `Musikalische Dienstleistungen gemäß Statement of Sales ${statement.period}`,
              qty: 1,
              unit_price_cents: amountCents,
            },
          ],
          currency: 'EUR',
          tax_rate_pct: taxRate,
          due_date: dueDate,
          send_email: sendEmail,
          send_to_label: sendToLabel,
        }),
      })
      const json = (await response.json().catch(() => null)) as {
        invoice?: ArtistInvoice
        error?: string
        message?: string
      } | null
      if (!response.ok || !json?.invoice) {
        throw new Error(json?.error ?? json?.message ?? t('invoice_error'))
      }
      onSuccess(json.invoice)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('invoice_error'))
    } finally {
      setSubmitting(false)
    }
  }

  const labeledSteps = effectiveSteps.map((s) => ({
    ...s,
    label:
      s.id === 'confirm'
        ? t('invoice_assistant_step_confirm')
        : s.id === 'billing'
          ? t('invoice_assistant_step_billing')
          : t('invoice_assistant_step_review'),
  }))

  return (
    <GuidedStepShell
      steps={labeledSteps}
      activeStepId={stepId}
      onStepChange={setStepId}
      maxReachableIndex={maxReachable}
      coachTitle={
        stepId === 'confirm'
          ? t('invoice_assistant_coach_confirm_title')
          : stepId === 'billing'
            ? t('invoice_assistant_coach_billing_title')
            : t('invoice_assistant_coach_review_title')
      }
      coachBody={
        stepId === 'confirm'
          ? t('invoice_assistant_coach_confirm_body')
          : stepId === 'billing'
            ? t('invoice_assistant_coach_billing_body')
            : t('invoice_assistant_coach_review_body')
      }
      coachChecks={[
        {
          id: 'stmt',
          label: t('invoice_assistant_check_statement'),
          done: invoiceable,
        },
        {
          id: 'bill',
          label: t('invoice_assistant_check_billing'),
          done: billingComplete,
        },
      ]}
      blockedReason={blockedReason}
      canContinue={stepComplete && !submitting}
      onBack={stepIndex <= 0 ? onCancel : goBack}
      onNext={() => void goNext()}
      nextLabel={
        stepId === 'review'
          ? submitting
            ? t('profile_saving')
            : t('invoice_assistant_send')
          : t('guided_continue')
      }
      isLastStep={stepId === 'review'}
      backLabel={stepIndex <= 0 ? t('invoice_save_draft') : t('guided_back')}
    >
      {stepId === 'confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoice_assistant_statement_card')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t('invoice_assistant_period')}: </span>
              <strong>{statement.period}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">{t('invoice_assistant_amount')}: </span>
              <strong>
                {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                  amountEur,
                )}
              </strong>
            </p>
            <p>
              <span className="text-muted-foreground">{t('invoice_assistant_status')}: </span>
              {statement.status}
            </p>
            {!invoiceable && (
              <p className="text-xs text-destructive" role="alert">
                {t('invoice_assistant_need_statement')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {stepId === 'billing' && (
        <div className="space-y-3">
          <InlineBillingProfileStep
            artistId={artistId}
            billingProfile={billingProfile}
            onComplete={(p) => {
              setBillingProfile(p)
              setBillingComplete(isBillingProfileComplete(p))
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t('invoice_assistant_iban_nudge')}{' '}
            <Link href="/portal/billing?mode=assistant&focus=payout" className="underline">
              {t('invoice_assistant_open_billing')}
            </Link>
          </p>
        </div>
      )}

      {stepId === 'review' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-num">{t('invoice_number')}</Label>
                <Input
                  id="inv-num"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <DateField
                id="inv-due"
                label={t('invoice_due_date')}
                value={dueDate}
                onChange={setDueDate}
                required
              />
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">{t('invoice_assistant_client')}: </span>
              {labelClient.name}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">{t('invoice_assistant_amount')}: </span>
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                amountEur,
              )}{' '}
              · {taxRate}% {t('invoice_tax')}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={(c) => setSendEmail(c === true)}
              />
              <Label htmlFor="send-email">{t('invoice_send')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-label"
                checked={sendToLabel}
                onCheckedChange={(c) => setSendToLabel(c === true)}
              />
              <Label htmlFor="send-label">{t('invoice_send_to_label')}</Label>
            </div>
          </CardContent>
        </Card>
      )}

      {stepId !== 'review' && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('guided_back')}
          </Button>
        </div>
      )}
    </GuidedStepShell>
  )
}
