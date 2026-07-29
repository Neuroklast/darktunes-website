'use client'

import { useTranslations } from 'next-intl'
import { Fragment, useState } from 'react'
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
import { DownloadSimple, FileText, Spinner } from '@phosphor-icons/react'
import type { ArtistBillingProfile } from '@/lib/api/artistBillingProfiles'
import type { SalesStatement } from '@/lib/api/salesStatements'
import type { StatementSourceProvenance } from '@/lib/api/distributorImportBatches'
import { getStatementPresignedUrl } from '../_actions/presignedUrl'
import { InlineBillingProfileStep } from '../../invoices/_components/InlineBillingProfileStep'
import { QuickInvoiceButton } from '../../analytics/_components/QuickInvoiceButton'
import { StatementProvenanceCard } from './StatementProvenanceCard'
import { StatementsTrustBanner } from './StatementsTrustBanner'

interface StatementsTableProps {
  artistId?: string
  billingProfile: ArtistBillingProfile | null
  billingProfileComplete: boolean
  invoicedStatementIds: string[]
  statements: SalesStatement[]
  provenanceByStatementId?: Record<string, StatementSourceProvenance>
}

function formatAmountEur(amount: number | undefined): string {
  if (amount === undefined) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function statusLabel(status: SalesStatement['status'], t: ReturnType<typeof useTranslations<'portal'>>): string {
  switch (status) {
    case 'draft':
      return t('statements_status_draft')
    case 'label_approved':
      return t('statements_status_approved')
    case 'artist_notified':
      return t('statements_status_notified')
    case 'viewed':
      return t('statements_status_viewed')
    case 'invoiced':
      return t('statements_status_invoiced')
    case 'acknowledged':
      return t('statements_status_acknowledged')
    case 'paid':
      return t('statements_status_paid')
    case 'superseded':
      return t('statements_status_superseded')
    case 'cancelled':
      return t('statements_status_cancelled')
    default:
      return status
  }
}

function statusVariant(status: SalesStatement['status']): 'outline' | 'secondary' | 'default' {
  switch (status) {
    case 'label_approved':
    case 'artist_notified':
    case 'viewed':
      return 'secondary'
    case 'invoiced':
    case 'acknowledged':
    case 'paid':
      return 'default'
    case 'superseded':
    case 'cancelled':
      return 'outline'
    default:
      return 'outline'
  }
}

function StatementActions({
  artistId,
  billingProfileComplete: _billingProfileComplete,
  hasInvoice,
  loadingId,
  onDownload,
  statement,
}: {
  artistId?: string
  billingProfileComplete: boolean
  hasInvoice: boolean
  loadingId: string | null
  onDownload: (id: string) => void
  statement: SalesStatement
}) {
  void _billingProfileComplete
  const t = useTranslations('portal')
  const canInvoice = ['label_approved', 'artist_notified', 'viewed'].includes(statement.status) && !hasInvoice

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        className="border-border hover:bg-primary/10 hover:text-primary"
        disabled={loadingId === statement.id}
        onClick={() => onDownload(statement.id)}
      >
        {loadingId === statement.id ? (
          <Spinner size={14} className="mr-1 animate-spin" aria-hidden="true" />
        ) : (
          <DownloadSimple size={14} className="mr-1" aria-hidden="true" />
        )}
        {t('statements_download')}
      </Button>
      {canInvoice && artistId && (
        <QuickInvoiceButton
          artistId={artistId}
          statement={statement}
        />
      )}
    </div>
  )
}

export function StatementsTable({
  artistId,
  billingProfile: initialBillingProfile,
  billingProfileComplete: initialBillingProfileComplete,
  invoicedStatementIds,
  statements,
  provenanceByStatementId = {},
}: StatementsTableProps) {
  const t = useTranslations('portal')

  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [expandedProvenanceId, setExpandedProvenanceId] = useState<string | null>(null)
  const [billingProfile, setBillingProfile] = useState(initialBillingProfile)
  const [billingProfileComplete, setBillingProfileComplete] = useState(initialBillingProfileComplete)
  const linkedStatementIds = new Set(invoicedStatementIds)

  const toggleProvenance = (id: string) => {
    setExpandedProvenanceId((prev) => (prev === id ? null : id))
  }

  const hasInvoiceableStatement = statements.some(
    (statement) =>
      ['label_approved', 'artist_notified', 'viewed'].includes(statement.status) &&
      !linkedStatementIds.has(statement.id),
  )

  const handleDownload = async (statementId: string) => {
    setLoadingId(statementId)
    toast.info(t('statements_downloading'))

    try {
      const result = await getStatementPresignedUrl(statementId)

      if (result.error || !result.url) {
        toast.error(t('statements_downloadError'))
        return
      }

      window.open(result.url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error(t('statements_downloadError'))
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('statements_heading')}</h1>

      <StatementsTrustBanner />

      {statements.length === 0 ? (
        <PortalEmptyState icon={FileText} heading={t('statements_noData')} description={t('statements_heading')} />
      ) : (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">{t('statements_heading')}</CardTitle>
          </CardHeader>
          {!billingProfileComplete && hasInvoiceableStatement && artistId && (
            <CardContent className="p-4 pt-0 pb-0">
              <InlineBillingProfileStep
                artistId={artistId}
                billingProfile={billingProfile}
                onComplete={(profile) => {
                  setBillingProfile(profile)
                  setBillingProfileComplete(true)
                }}
              />
            </CardContent>
          )}
          <CardContent className="p-4 pt-0 space-y-3 md:hidden">
            {statements.map((statement) => {
              const hasInvoice = linkedStatementIds.has(statement.id)
              const prov = provenanceByStatementId[statement.id]
              return (
                <div
                  key={statement.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="font-mono text-sm font-medium">{statement.period}</p>
                    <p className="text-xs text-muted-foreground truncate">{statement.filename}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={statusVariant(statement.status)}>
                        {statusLabel(statement.status, t)}
                      </Badge>
                      <span className="text-sm tabular-nums">{formatAmountEur(statement.amountEur)}</span>
                    </div>
                    {hasInvoice && (
                      <Badge variant="secondary" className="mt-2">{t('analytics_invoice_exists')}</Badge>
                    )}
                    {prov?.fileHash && (
                      <Badge
                        variant="outline"
                        className="mt-2 border-emerald-600/40 text-emerald-900 dark:text-emerald-100"
                      >
                        {t('statements_provenance_badge')}
                      </Badge>
                    )}
                  </div>
                  <StatementActions
                    artistId={artistId}
                    billingProfileComplete={billingProfileComplete}
                    hasInvoice={hasInvoice}
                    loadingId={loadingId}
                    onDownload={handleDownload}
                    statement={statement}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-start min-h-[44px] text-xs"
                    onClick={() => toggleProvenance(statement.id)}
                    aria-expanded={expandedProvenanceId === statement.id}
                  >
                    {expandedProvenanceId === statement.id
                      ? t('statements_provenance_hide')
                      : t('statements_provenance_show')}
                  </Button>
                  {expandedProvenanceId === statement.id && artistId && (
                    <StatementProvenanceCard
                      artistId={artistId}
                      statementId={statement.id}
                      statementPeriod={statement.period}
                      provenance={prov}
                    />
                  )}
                </div>
              )
            })}
          </CardContent>
          <CardContent className="hidden md:block overflow-x-auto overflow-y-clip overscroll-x-contain p-0" data-lenis-prevent>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="whitespace-nowrap">{t('statements_period')}</TableHead>
                  <TableHead>{t('statements_filename')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('statements_status')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('statements_amount')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('statements_actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement) => {
                  const hasInvoice = linkedStatementIds.has(statement.id)
                  const prov = provenanceByStatementId[statement.id]
                  const open = expandedProvenanceId === statement.id
                  return (
                    <Fragment key={statement.id}>
                      <TableRow className="border-border hover:bg-muted/50">
                        <TableCell className="whitespace-nowrap font-mono text-sm">{statement.period}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <span>{statement.filename}</span>
                            {prov?.fileHash && (
                              <Badge
                                variant="outline"
                                className="border-emerald-600/40 text-emerald-900 dark:text-emerald-100 text-[10px]"
                              >
                                {t('statements_provenance_badge')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(statement.status)}>
                            {statusLabel(statement.status, t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono text-sm">
                          {formatAmountEur(statement.amountEur)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-2">
                            <StatementActions
                              artistId={artistId}
                              billingProfileComplete={billingProfileComplete}
                              hasInvoice={hasInvoice}
                              loadingId={loadingId}
                              onDownload={handleDownload}
                              statement={statement}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-xs h-8"
                              onClick={() => toggleProvenance(statement.id)}
                              aria-expanded={open}
                            >
                              {open
                                ? t('statements_provenance_hide')
                                : t('statements_provenance_show')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {open && artistId && (
                        <TableRow className="border-border hover:bg-transparent">
                          <TableCell colSpan={5} className="p-3 bg-muted/20">
                            <StatementProvenanceCard
                              artistId={artistId}
                              statementId={statement.id}
                              statementPeriod={statement.period}
                              provenance={prov}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}