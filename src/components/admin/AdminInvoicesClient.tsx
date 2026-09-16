'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CaretLeft, CaretRight, FilePdf } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { AdminListShell } from '@/components/admin/AdminListShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAdminAccessToken } from '@/lib/admin/getAccessToken'
import type { AdminInvoiceUiItem } from '@/lib/portal/invoiceUi'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50

const INVOICE_STATUSES = [
  'draft',
  'sent',
  'received',
  'partially_paid',
  'paid',
  'cancelled',
] as const

type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

function statusBadgeVariant(
  status: InvoiceStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default'
    case 'sent':
    case 'received':
    case 'partially_paid':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

function grossTotal(invoice: AdminInvoiceUiItem): number {
  const subtotal = invoice.lineItems.reduce(
    (sum, item) => sum + item.qty * item.unit_price_cents,
    0,
  )
  const tax = Math.round(subtotal * (invoice.taxRatePct / 100))
  return (subtotal + tax) / 100
}

function formatAmount(invoice: AdminInvoiceUiItem): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: invoice.currency,
  }).format(grossTotal(invoice))
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value))
}

interface AdminInvoicesClientProps {
  artists: Array<{ id: string; name: string }>
}

export function AdminInvoicesClient({ artists }: AdminInvoicesClientProps) {
  const t = useTranslations('admin.invoices')
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('id')

  const [items, setItems] = useState<AdminInvoiceUiItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [artistId, setArtistId] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getAdminAccessToken()
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (artistId) params.set('artist_id', artistId)
      if (status) params.set('status', status)

      const response = await fetch(`/api/admin/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = (await response.json().catch(() => null)) as
        | { items?: AdminInvoiceUiItem[]; total?: number; error?: string }
        | null
      if (!response.ok) throw new Error(json?.error ?? t('loadError'))
      setItems(json?.items ?? [])
      setTotal(json?.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [artistId, page, status, t])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const handleDownload = useCallback(
    async (invoiceId: string) => {
      // Open the tab synchronously so popup blockers allow the later navigation.
      const newTab = window.open('', '_blank')
      if (newTab) newTab.opener = null
      try {
        const token = await getAdminAccessToken()
        const response = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = (await response.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null
        if (!response.ok || !json?.url) throw new Error(json?.error ?? t('loadError'))
        if (newTab) {
          newTab.location.href = json.url
        } else {
          window.location.assign(json.url)
        }
      } catch (err) {
        newTab?.close()
        toast.error(err instanceof Error ? err.message : t('loadError'))
      }
    },
    [t],
  )

  const filters = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        aria-label={t('filterArtist')}
        value={artistId}
        onChange={(event) => {
          setArtistId(event.target.value)
          setPage(1)
        }}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">{t('filterAllArtists')}</option>
        {artists.map((artist) => (
          <option key={artist.id} value={artist.id}>
            {artist.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t('filterStatus')}
        value={status}
        onChange={(event) => {
          setStatus(event.target.value)
          setPage(1)
        }}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
      >
        <option value="">{t('filterAllStatuses')}</option>
        {INVOICE_STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`status.${value}`)}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        {t('resultCount', { count: total })}
      </span>
    </div>
  )

  return (
    <AdminListShell
      header={filters}
      footer={
        pageCount > 1 ? (
          <div className="flex items-center justify-end gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <CaretLeft size={14} aria-hidden="true" />
              {t('previous')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('pageOf', { page, pages: pageCount })}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              {t('next')}
              <CaretRight size={14} aria-hidden="true" />
            </Button>
          </div>
        ) : null
      }
    >
      {error ? (
        <div className="p-8 text-center text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{t('empty')}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{t('colNumber')}</TableHead>
              <TableHead>{t('colArtist')}</TableHead>
              <TableHead>{t('colClient')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('colTotal')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('colStatus')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('colIssued')}</TableHead>
              <TableHead className="whitespace-nowrap">{t('colDue')}</TableHead>
              <TableHead className="text-right whitespace-nowrap">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((invoice) => (
              <TableRow
                key={invoice.id}
                className={cn(
                  highlightId === invoice.id && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
                )}
              >
                <TableCell className="font-mono text-xs">
                  {invoice.artistInvoiceNumber ?? invoice.invoiceNumber}
                </TableCell>
                <TableCell className="text-sm">{invoice.artistName || '—'}</TableCell>
                <TableCell className="text-sm">
                  <span className="block">{invoice.clientName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {invoice.clientEmail}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatAmount(invoice)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(invoice.status as InvoiceStatus)}>
                    {t(`status.${invoice.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(invoice.issuedDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(invoice.dueDate)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={!invoice.hasPdf}
                    onClick={() => void handleDownload(invoice.id)}
                  >
                    <FilePdf size={14} aria-hidden="true" />
                    {t('downloadPdf')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminListShell>
  )
}
