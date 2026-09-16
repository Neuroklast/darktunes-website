'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, DownloadSimple, FileText } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PortalEmptyState } from '@/components/portal/PortalEmptyState'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type { ArtistInvoice } from '@/lib/api/artistInvoices'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { LabelClientInfo } from '@/lib/portal/labelBilling'
import { getPortalAuthHeaders } from '@/lib/portal/portalFetchAuth'
import {
  invoiceEmailError,
  invoiceEmailFailed,
  invoiceFollowUpWarning,
  type InvoiceSubmitMeta,
} from '@/lib/portal/invoiceSubmission'
import { toPortalInvoiceListItem, type PortalInvoiceListItem } from '@/lib/portal/invoiceUi'
import { FreeInvoiceGenerator } from './FreeInvoiceGenerator'
import { InvoiceForm } from './InvoiceForm'
import { InvoiceFromStatementAssistant } from './InvoiceFromStatementAssistant'

interface InvoicesClientProps {
  artistId: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  labelClient: LabelClientInfo
  invoices: PortalInvoiceListItem[]
  statement: SalesStatement | null
}

function statusBadgeVariant(status: ArtistInvoice['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default'
    case 'sent':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

function statusLabel(status: ArtistInvoice['status'], t: ReturnType<typeof useTranslations<'portal'>>): string {
  switch (status) {
    case 'draft':
      return t('invoice_status_draft')
    case 'sent':
      return t('invoice_status_sent')
    case 'paid':
      return t('invoice_status_paid')
    case 'cancelled':
      return t('invoice_status_cancelled')
    default:
      return status
  }
}

type ActiveTab = 'my-invoices' | 'generator'

export function InvoicesClient({
  artistId,
  billingProfile,
  billingProfileComplete,
  labelClient,
  invoices: initialInvoices,
  statement,
}: InvoicesClientProps) {
  const t = useTranslations('portal')

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<PortalInvoiceListItem[]>(initialInvoices)
  const [showForm, setShowForm] = useState(Boolean(statement))
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-invoices')

  const clearStatementQuery = () => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('statement')
    router.replace(nextParams.size > 0 ? `${pathname}?${nextParams.toString()}` : pathname)
  }

  const handleNewInvoice = (invoice: ArtistInvoice, meta?: InvoiceSubmitMeta) => {
    // Replays return the existing row — replace instead of duplicating it.
    setInvoices((prev) => [
      toPortalInvoiceListItem(invoice),
      ...prev.filter((entry) => entry.id !== invoice.id),
    ])
    setShowForm(false)
    clearStatementQuery()

    if (meta?.warnings.includes('already_exists')) {
      toast.info(t('invoice_already_exists'))
      return
    }
    if (meta && invoiceEmailFailed(meta)) {
      toast.warning(t('invoice_email_failed', { error: invoiceEmailError(meta) ?? 'unknown' }))
      return
    }
    if (meta && invoiceFollowUpWarning(meta)) {
      toast.warning(t('invoice_created_with_warnings'))
      return
    }
    toast.success(invoice.status === 'sent' ? t('invoice_sent_success') : t('invoice_save_success'))
  }

  const handleDownloadPdf = async (invoice: PortalInvoiceListItem) => {
    // Open the tab synchronously so popup blockers allow the later navigation.
    const newTab = window.open('', '_blank')
    if (newTab) newTab.opener = null
    try {
      const headers = await getPortalAuthHeaders()
      const params = new URLSearchParams({ artist_id: artistId })
      const response = await fetch(`/api/portal/invoices/${invoice.id}/pdf?${params.toString()}`, {
        headers,
      })
      const json = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null
      if (!response.ok || !json?.url) throw new Error(json?.error ?? t('invoice_error'))
      if (newTab) {
        newTab.location.href = json.url
      } else {
        window.location.assign(json.url)
      }
    } catch (err) {
      newTab?.close()
      toast.error(err instanceof Error ? err.message : t('invoice_error'))
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    if (statement) {
      clearStatementQuery()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('invoices_heading')}</h1>
          {statement && (
            <p className="text-sm text-muted-foreground">
              SOS {statement.period} —{' '}
              {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                statement.amountEur ?? 0,
              )}
            </p>
          )}
        </div>
        {activeTab === 'my-invoices' && (
          <Button className="gap-2" onClick={() => setShowForm((current) => !current)} size="sm">
            <Plus size={16} aria-hidden="true" />
            {t('invoice_new')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
        role="tablist"
        aria-label={t('invoices_heading')}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'my-invoices'}
          aria-controls="tab-panel-my-invoices"
          id="tab-my-invoices"
          type="button"
          onClick={() => setActiveTab('my-invoices')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'my-invoices'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('invoice_my_invoices_tab')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'generator'}
          aria-controls="tab-panel-generator"
          id="tab-generator"
          type="button"
          onClick={() => setActiveTab('generator')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === 'generator'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('invoice_generator_tab')}
        </button>
      </div>

      {/* My Invoices tab panel */}
      <div
        id="tab-panel-my-invoices"
        role="tabpanel"
        aria-labelledby="tab-my-invoices"
        hidden={activeTab !== 'my-invoices'}
      >
        {activeTab === 'my-invoices' && (
          <div className="space-y-6">
            {showForm && statement ? (
              <InvoiceFromStatementAssistant
                artistId={artistId}
                statement={statement}
                billingProfile={billingProfile}
                billingProfileComplete={billingProfileComplete}
                labelClient={labelClient}
                onCancel={handleCancel}
                onSuccess={handleNewInvoice}
              />
            ) : null}
            {showForm && !statement ? (
              <InvoiceForm
                artistId={artistId}
                billingProfile={billingProfile}
                billingProfileComplete={billingProfileComplete}
                labelClient={labelClient}
                onCancel={handleCancel}
                onSuccess={handleNewInvoice}
              />
            ) : null}

            {invoices.length === 0 ? (
              <PortalEmptyState
                icon={FileText}
                heading={t('invoices_heading')}
                description={t('invoice_noData')}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('invoices_heading')}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto overflow-y-clip overscroll-x-contain p-0" data-lenis-prevent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">{t('invoice_number')}</TableHead>
                        <TableHead>{t('invoice_client')}</TableHead>
                        <TableHead className="whitespace-nowrap">{t('invoice_total')}</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => {
                        const subtotal = invoice.lineItems.reduce(
                          (sum, item) => sum + item.qty * item.unit_price_cents,
                          0,
                        )
                        const tax = Math.round(subtotal * (invoice.taxRatePct / 100))
                        const total = (subtotal + tax) / 100

                        return (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm">
                              {invoice.artistInvoiceNumber ?? invoice.invoiceNumber}
                            </TableCell>
                            <TableCell>{invoice.clientName}</TableCell>
                            <TableCell>
                              {new Intl.NumberFormat('de-DE', {
                                style: 'currency',
                                currency: invoice.currency,
                              }).format(total)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusBadgeVariant(invoice.status)}>
                                {statusLabel(invoice.status, t)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {invoice.hasPdf ? (
                                <Button
                                  className="gap-1"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleDownloadPdf(invoice)}
                                >
                                  <DownloadSimple size={14} aria-hidden="true" />
                                  {t('invoice_download_pdf')}
                                </Button>
                              ) : (
                                <Button
                                  className="gap-1 opacity-50"
                                  disabled
                                  size="sm"
                                  variant="ghost"
                                >
                                  <DownloadSimple size={14} aria-hidden="true" />
                                  {t('invoice_no_pdf')}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Free Generator tab panel */}
      <div
        id="tab-panel-generator"
        role="tabpanel"
        aria-labelledby="tab-generator"
        hidden={activeTab !== 'generator'}
      >
        {activeTab === 'generator' && (
          <FreeInvoiceGenerator
            artistId={artistId}
            billingProfile={billingProfile}
            billingProfileComplete={billingProfileComplete}
          />
        )}
      </div>
    </div>
  )
}
