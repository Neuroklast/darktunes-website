'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { Info, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/ui/date-field'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type { ArtistInvoice } from '@/lib/api/artistInvoices'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { LabelClientInfo } from '@/lib/portal/labelBilling'
import { InlineBillingProfileStep } from './InlineBillingProfileStep'

interface LineItem {
  description: string
  qty: number
  unit_price_cents: number
}

interface InvoiceFormProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  labelClient: LabelClientInfo
  onSuccess: (invoice: ArtistInvoice) => void
  onCancel: () => void
  statement?: SalesStatement
}

function buildStatementLineItem(statement?: SalesStatement): LineItem[] {
  if (!statement) {
    return [{ description: '', qty: 1, unit_price_cents: 0 }]
  }

  return [{
    description: `Musikalische Dienstleistungen gemäß Statement of Sales ${statement.period}`,
    qty: 1,
    unit_price_cents: Math.round((statement.amountEur ?? 0) * 100),
  }]
}

export function InvoiceForm({
  artistId,
  billingProfile: initialBillingProfile,
  billingProfileComplete: initialBillingComplete,
  labelClient,
  onSuccess,
  onCancel,
  statement,
}: InvoiceFormProps) {
  const t = useTranslations('portal')

  const [billingProfile, setBillingProfile] = useState(initialBillingProfile)
  const [billingProfileComplete, setBillingProfileComplete] = useState(initialBillingComplete)
  const isStatementLinked = Boolean(statement)
  const [artistInvoiceNumber, setArtistInvoiceNumber] = useState('')
  const [clientName, setClientName] = useState(isStatementLinked ? labelClient.name : '')
  const [clientEmail, setClientEmail] = useState(isStatementLinked ? labelClient.email : '')
  const [clientAddress, setClientAddress] = useState(isStatementLinked ? labelClient.address : '')
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [taxRatePct, setTaxRatePct] = useState(
    billingProfile?.taxStatus && billingProfile.taxStatus !== 'standard'
      ? 0
      : billingProfile?.isSmallBusiness
        ? 0
        : 19,
  )
  const [notes, setNotes] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [sendToLabel, setSendToLabel] = useState(true)
  const [lineItems, setLineItems] = useState<LineItem[]>(buildStatementLineItem(statement))
  const [submitting, setSubmitting] = useState(false)

  const subtotal = useMemo(
    () => lineItems.reduce((sum, lineItem) => sum + lineItem.qty * lineItem.unit_price_cents, 0),
    [lineItems],
  )
  const tax = Math.round(subtotal * (taxRatePct / 100))
  const total = subtotal + tax

  const formatCents = (cents: number) => new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(cents / 100)

  const addLineItem = () => setLineItems((current) => [...current, { description: '', qty: 1, unit_price_cents: 0 }])
  const removeLineItem = (index: number) => setLineItems((current) => current.filter((_, currentIndex) => currentIndex !== index))
  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((current) => current.map((item, currentIndex) => {
      if (currentIndex !== index) return item
      return { ...item, [field]: value }
    }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!billingProfileComplete) {
      toast.error(t('invoice_billing_incomplete'))
      return
    }

    if (!artistInvoiceNumber.trim() || !clientName.trim() || !clientEmail.trim() || !dueDate) {
      toast.error(t('invoice_error'))
      return
    }

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
          Authorization: ['Bearer', session.access_token].join(' '),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artistId,
          artist_invoice_number: artistInvoiceNumber,
          client_name: clientName,
          client_email: clientEmail,
          client_address: clientAddress || undefined,
          statement_id: statement?.id,
          line_items: lineItems,
          currency,
          tax_rate_pct: taxRatePct,
          due_date: dueDate,
          notes,
          send_email: sendEmail,
          send_to_label: sendToLabel,
        }),
      })

      const json = (await response.json().catch(() => null)) as
        | { invoice?: ArtistInvoice; error?: string }
        | null

      if (!response.ok || !json?.invoice) {
        throw new Error(json?.error ?? t('invoice_error'))
      }

      onSuccess(json.invoice)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('invoice_error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!billingProfileComplete) {
    return (
      <InlineBillingProfileStep
        artistId={artistId}
        billingProfile={billingProfile}
        onComplete={(profile) => {
          setBillingProfile(profile)
          setBillingProfileComplete(true)
          setTaxRatePct(profile.isSmallBusiness ? 0 : 19)
        }}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('invoice_new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>

          {statement && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <Info size={16} aria-hidden="true" />
                {t('invoice_statement_reference')}
              </div>
              <p>SOS {statement.period}</p>
              <p>{t('invoice_locked_amount')}: {formatCents(Math.round((statement.amountEur ?? 0) * 100))}</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="artist-invoice-number">{t('invoice_artist_invoice_number')}</Label>
              <Input
                id="artist-invoice-number"
                required
                value={artistInvoiceNumber}
                onChange={(event) => setArtistInvoiceNumber(event.target.value)}
              />
            </div>
            <DateField
              id="invoice-due-date"
              label={t('invoice_due_date')}
              required
              value={dueDate}
              onChange={setDueDate}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice-client-name">{t('invoice_client_name')}</Label>
              <Input
                id="invoice-client-name"
                required
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                readOnly={isStatementLinked}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-client-email">{t('invoice_client_email')}</Label>
              <Input
                id="invoice-client-email"
                required
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                readOnly={isStatementLinked}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="invoice-client-address">{t('invoice_client_address')}</Label>
              <Input
                id="invoice-client-address"
                value={clientAddress}
                onChange={(event) => setClientAddress(event.target.value)}
                readOnly={isStatementLinked}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invoice-currency">{t('invoice_currency')}</Label>
              <select
                id="invoice-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-tax-rate">{t('invoice_tax_rate')}</Label>
              <Input
                id="invoice-tax-rate"
                type="number"
                min={0}
                max={100}
                step={0.1}
                disabled={billingProfile?.isSmallBusiness}
                value={taxRatePct}
                onChange={(event) => setTaxRatePct(parseFloat(event.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('invoice_line_items')}</Label>
              {!isStatementLinked && (
                <Button className="gap-1" onClick={addLineItem} size="sm" type="button" variant="outline">
                  <Plus size={14} aria-hidden="true" />
                  {t('invoice_line_add')}
                </Button>
              )}
            </div>
            {lineItems.map((item, index) => (
              <div key={index} className="grid items-start gap-2 sm:grid-cols-[1fr_90px_140px_44px]">
                <Input
                  placeholder={t('invoice_line_description')}
                  required
                  value={item.description}
                  onChange={(event) => updateLineItem(index, 'description', event.target.value)}
                />
                <Input
                  type="number"
                  min={1}
                  disabled={isStatementLinked}
                  placeholder={t('invoice_line_qty')}
                  value={item.qty}
                  onChange={(event) => updateLineItem(index, 'qty', parseInt(event.target.value, 10) || 1)}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  disabled={isStatementLinked}
                  placeholder={t('invoice_line_unit_price')}
                  value={item.unit_price_cents / 100}
                  onChange={(event) => updateLineItem(index, 'unit_price_cents', Math.round(parseFloat(event.target.value) * 100) || 0)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isStatementLinked || lineItems.length === 1}
                  onClick={() => removeLineItem(index)}
                  aria-label={t('invoice_line_remove')}
                >
                  <Trash size={14} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t pt-3 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>{t('invoice_subtotal')}</span>
              <span>{formatCents(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('invoice_tax')} ({taxRatePct.toFixed(2)}%)</span>
              <span>{formatCents(tax)}</span>
            </div>
            <div className="flex justify-between font-semibold text-foreground">
              <span>{t('invoice_total')}</span>
              <span>{formatCents(total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-notes">{t('invoice_notes')}</Label>
            <Textarea
              id="invoice-notes"
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={sendEmail}
                className="h-4 w-4 rounded border-border"
                onChange={(event) => setSendEmail(event.target.checked)}
                type="checkbox"
              />
              <span>{t('invoice_send')}</span>
            </label>
            <label className={cn('flex items-center gap-2', isStatementLinked && 'opacity-70')}>
              <input
                checked={sendToLabel}
                className="h-4 w-4 rounded border-border"
                onChange={(event) => setSendToLabel(event.target.checked)}
                type="checkbox"
              />
              <span>{t('invoice_send_to_label')}</span>
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <Button onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={submitting || !artistId || !billingProfileComplete} type="submit">
              {submitting ? 'Creating…' : t('invoice_send')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
