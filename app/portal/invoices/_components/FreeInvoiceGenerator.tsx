'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { Plus, Trash, DownloadSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/ui/date-field'
import { cn } from '@/lib/utils'
import type { ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type { GeneratePdfInput } from '../_actions/generatePdf'
import { generateFreePdf } from '../_actions/generatePdf'
import { InlineBillingProfileStep } from './InlineBillingProfileStep'

interface LineItem {
  description: string
  qty: number
  unitPriceCents: number
}

interface FreeInvoiceGeneratorProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
}

function applyBillingProfileToSender(
  profile: ArtistBillingProfile,
  setters: {
    setSenderName: (value: string) => void
    setSenderStreet: (value: string) => void
    setSenderPostalCode: (value: string) => void
    setSenderCity: (value: string) => void
    setSenderCountry: (value: string) => void
    setSenderTaxNumber: (value: string) => void
    setSenderVatId: (value: string) => void
    setSenderEmail: (value: string) => void
    setIsSmallBusiness: (value: boolean) => void
    setTaxRatePct: (value: number) => void
  },
) {
  setters.setSenderName(profile.legalName ?? '')
  setters.setSenderStreet(profile.street ?? '')
  setters.setSenderPostalCode(profile.postalCode ?? '')
  setters.setSenderCity(profile.city ?? '')
  setters.setSenderCountry(profile.country ?? '')
  setters.setSenderTaxNumber(profile.taxNumber ?? '')
  setters.setSenderVatId(profile.vatId ?? '')
  setters.setSenderEmail(profile.paypalEmail ?? '')
  setters.setIsSmallBusiness(profile.isSmallBusiness ?? false)
  setters.setTaxRatePct(profile.isSmallBusiness ? 0 : 19)
}

export function FreeInvoiceGenerator({
  artistId,
  billingProfile: initialBillingProfile,
  billingProfileComplete: initialBillingComplete,
}: FreeInvoiceGeneratorProps) {
  const t = useTranslations('portal')

  const [billingProfile, setBillingProfile] = useState(initialBillingProfile)
  const [billingProfileComplete, setBillingProfileComplete] = useState(initialBillingComplete)
  const today = new Date().toISOString().slice(0, 10)

  // Sender fields — pre-filled from billing profile when available
  const [senderName, setSenderName] = useState(billingProfile?.legalName ?? '')
  const [senderStreet, setSenderStreet] = useState(billingProfile?.street ?? '')
  const [senderPostalCode, setSenderPostalCode] = useState(billingProfile?.postalCode ?? '')
  const [senderCity, setSenderCity] = useState(billingProfile?.city ?? '')
  const [senderCountry, setSenderCountry] = useState(billingProfile?.country ?? '')
  const [senderTaxNumber, setSenderTaxNumber] = useState(billingProfile?.taxNumber ?? '')
  const [senderVatId, setSenderVatId] = useState(billingProfile?.vatId ?? '')
  const [senderEmail, setSenderEmail] = useState(billingProfile?.paypalEmail ?? '')
  const [isSmallBusiness, setIsSmallBusiness] = useState(billingProfile?.isSmallBusiness ?? false)

  // Recipient fields
  const [recipientName, setRecipientName] = useState('')
  const [recipientStreet, setRecipientStreet] = useState('')
  const [recipientPostalCode, setRecipientPostalCode] = useState('')
  const [recipientCity, setRecipientCity] = useState('')
  const [recipientCountry, setRecipientCountry] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')

  // Invoice meta
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issuedDate, setIssuedDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [taxRatePct, setTaxRatePct] = useState(billingProfile?.isSmallBusiness ? 0 : 19)
  const [notes, setNotes] = useState('')

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', qty: 1, unitPriceCents: 0 },
  ])

  const [generating, setGenerating] = useState(false)

  const addLineItem = () =>
    setLineItems((prev) => [...prev, { description: '', qty: 1, unitPriceCents: 0 }])

  const removeLineItem = (index: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== index))

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) =>
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )

  const subtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0),
    [lineItems],
  )
  const effectiveTaxRate = isSmallBusiness ? 0 : taxRatePct
  const tax = Math.round(subtotal * (effectiveTaxRate / 100))
  const total = subtotal + tax

  const formatCents = (cents: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!billingProfileComplete) {
      toast.error(t('invoice_billing_incomplete'))
      return
    }

    const input: GeneratePdfInput = {
      invoiceNumber,
      issuedDate,
      dueDate: dueDate || undefined,
      sender: {
        name: senderName,
        street: senderStreet,
        postalCode: senderPostalCode,
        city: senderCity,
        country: senderCountry,
        taxNumber: senderTaxNumber || undefined,
        vatId: senderVatId || undefined,
        email: senderEmail || undefined,
      },
      recipient: {
        name: recipientName,
        street: recipientStreet,
        postalCode: recipientPostalCode,
        city: recipientCity,
        country: recipientCountry,
        email: recipientEmail || undefined,
      },
      lineItems,
      currency,
      taxRatePct: effectiveTaxRate,
      isSmallBusiness,
      notes: notes || undefined,
    }

    setGenerating(true)
    try {
      const result = await generateFreePdf(input)

      if (result.error || !result.base64) {
        toast.error(result.error ?? t('invoice_generator_error'))
        return
      }

      // Trigger browser download
      const byteArray = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename ?? 'rechnung.pdf'
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success(t('invoice_generator_success'))
    } catch {
      toast.error(t('invoice_generator_error'))
    } finally {
      setGenerating(false)
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
          applyBillingProfileToSender(profile, {
            setSenderName,
            setSenderStreet,
            setSenderPostalCode,
            setSenderCity,
            setSenderCountry,
            setSenderTaxNumber,
            setSenderVatId,
            setSenderEmail,
            setIsSmallBusiness,
            setTaxRatePct,
          })
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t('invoice_generator_desc')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('invoice_generator_pdf_only')}</p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Sender */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoice_sender_section')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gen-sender-name">{t('invoice_sender_name')}</Label>
              <Input
                id="gen-sender-name"
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gen-sender-street">{t('invoice_sender_street')}</Label>
                <Input
                  id="gen-sender-street"
                  required
                  value={senderStreet}
                  onChange={(e) => setSenderStreet(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-sender-postal">{t('invoice_sender_postal_code')}</Label>
                <Input
                  id="gen-sender-postal"
                  required
                  value={senderPostalCode}
                  onChange={(e) => setSenderPostalCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-sender-city">{t('invoice_sender_city')}</Label>
                <Input
                  id="gen-sender-city"
                  required
                  value={senderCity}
                  onChange={(e) => setSenderCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-sender-country">{t('invoice_sender_country')}</Label>
                <Input
                  id="gen-sender-country"
                  required
                  value={senderCountry}
                  onChange={(e) => setSenderCountry(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gen-sender-tax">{t('invoice_sender_tax_number')}</Label>
                <Input
                  id="gen-sender-tax"
                  value={senderTaxNumber}
                  onChange={(e) => setSenderTaxNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-sender-vat">{t('invoice_sender_vat_id')}</Label>
                <Input
                  id="gen-sender-vat"
                  value={senderVatId}
                  onChange={(e) => setSenderVatId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-sender-email">{t('invoice_sender_email')}</Label>
                <Input
                  id="gen-sender-email"
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={isSmallBusiness}
                onChange={(e) => {
                  setIsSmallBusiness(e.target.checked)
                  setTaxRatePct(e.target.checked ? 0 : 19)
                }}
              />
              <span>{t('invoice_small_business')}</span>
            </label>
          </CardContent>
        </Card>

        {/* Recipient */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoice_client')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gen-rec-name">{t('invoice_client_name')}</Label>
                <Input
                  id="gen-rec-name"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-rec-email">{t('invoice_client_email')}</Label>
                <Input
                  id="gen-rec-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gen-rec-street">{t('invoice_sender_street')}</Label>
                <Input
                  id="gen-rec-street"
                  required
                  value={recipientStreet}
                  onChange={(e) => setRecipientStreet(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-rec-postal">{t('invoice_sender_postal_code')}</Label>
                <Input
                  id="gen-rec-postal"
                  required
                  value={recipientPostalCode}
                  onChange={(e) => setRecipientPostalCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-rec-city">{t('invoice_sender_city')}</Label>
                <Input
                  id="gen-rec-city"
                  required
                  value={recipientCity}
                  onChange={(e) => setRecipientCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-rec-country">{t('invoice_sender_country')}</Label>
                <Input
                  id="gen-rec-country"
                  required
                  value={recipientCountry}
                  onChange={(e) => setRecipientCountry(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice meta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('invoice_new')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="gen-number">{t('invoice_artist_invoice_number')}</Label>
                <Input
                  id="gen-number"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <DateField
                id="gen-issued"
                label={t('invoice_issued_date')}
                required
                value={issuedDate}
                onChange={setIssuedDate}
              />
              <DateField
                id="gen-due"
                label={t('invoice_due_date')}
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gen-currency">{t('invoice_currency')}</Label>
                <select
                  id="gen-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gen-tax-rate">{t('invoice_tax_rate')}</Label>
                <Input
                  id="gen-tax-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  disabled={isSmallBusiness}
                  value={effectiveTaxRate}
                  onChange={(e) => setTaxRatePct(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('invoice_line_items')}</Label>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addLineItem}>
                  <Plus size={14} aria-hidden="true" />
                  {t('invoice_line_add')}
                </Button>
              </div>
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="grid items-start gap-2 sm:grid-cols-[1fr_90px_140px_44px]"
                >
                  <Input
                    placeholder={t('invoice_line_description')}
                    required
                    value={item.description}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  />
                  <Input
                    type="number"
                    min={1}
                    placeholder={t('invoice_line_qty')}
                    value={item.qty}
                    onChange={(e) =>
                      updateLineItem(index, 'qty', parseInt(e.target.value, 10) || 1)
                    }
                  />
                    <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder={t('invoice_line_unit_price')}
                    value={item.unitPriceCents / 100}
                    onChange={(e) =>
                      updateLineItem(index, 'unitPriceCents', Math.round(parseFloat(e.target.value) * 100) || 0)
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={lineItems.length === 1}
                    onClick={() => removeLineItem(index)}
                    aria-label={t('invoice_line_remove')}
                  >
                    <Trash size={14} aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 border-t pt-3 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>{t('invoice_subtotal')}</span>
                <span>{formatCents(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {t('invoice_tax')} ({effectiveTaxRate.toFixed(2)}%)
                </span>
                <span>{formatCents(tax)}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <span>{t('invoice_total')}</span>
                <span>{formatCents(total)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="gen-notes">{t('invoice_notes')}</Label>
              <Textarea
                id="gen-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className={cn('flex justify-end')}>
          <Button
            type="submit"
            disabled={generating || !artistId || !billingProfileComplete}
            className="gap-2"
          >
            <DownloadSimple size={16} aria-hidden="true" />
            {generating ? t('invoice_generating') : t('invoice_generate_download')}
          </Button>
        </div>
      </form>
    </div>
  )
}
