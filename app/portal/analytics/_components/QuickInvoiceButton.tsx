'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PaperPlaneTilt, Spinner, MagicWand } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import {
  DEFAULT_INVOICE_DUE_DAYS,
  DEFAULT_TAX_RATE_PCT,
} from '@/lib/analytics/constants'
import type { SalesStatement } from '@/lib/api/salesStatements'

interface QuickInvoiceButtonProps {
  artistId: string
  statement: SalesStatement
}

function dueDateFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function defaultArtistInvoiceNumber(period: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `SOS-${period}-${stamp}`
}

export function QuickInvoiceButton({
  artistId,
  statement,
}: QuickInvoiceButtonProps) {
  const t = useTranslations('portal')
  const [submitting, setSubmitting] = useState(false)

  const assistantHref = `/portal/invoices?statement=${encodeURIComponent(statement.id)}`
  const amountLabel = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(statement.amountEur ?? 0)

  const handleQuickInvoice = async () => {
    setSubmitting(true)
    try {
      const supabase = createBrowserSupabaseClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error(t('profile_error'))

      const amountCents = Math.round((statement.amountEur ?? 0) * 100)
      const response = await fetch('/api/portal/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          artist_id: artistId,
          artist_invoice_number: defaultArtistInvoiceNumber(statement.period),
          // Server overrides label client fields for SOS-linked invoices.
          client_name: 'Label',
          client_email: 'label@localhost',
          client_address: '',
          statement_id: statement.id,
          line_items: [{
            description: `Musikalische Dienstleistungen gemäß Statement of Sales ${statement.period}`,
            qty: 1,
            unit_price_cents: amountCents,
          }],
          currency: 'EUR',
          tax_rate_pct: DEFAULT_TAX_RATE_PCT,
          due_date: dueDateFromNow(DEFAULT_INVOICE_DUE_DAYS),
          send_email: true,
          send_to_label: true,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string; error?: string }
        throw new Error(payload.error ?? payload.message ?? t('invoice_error'))
      }

      toast.success(t('analytics_invoice_sent'))
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('invoice_error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="gap-1" asChild>
        <Link href={assistantHref}>
          <MagicWand size={14} aria-hidden="true" />
          {t('invoice_assistant_cta')}
        </Link>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={submitting} className="gap-1">
            {submitting ? (
              <Spinner size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <PaperPlaneTilt size={14} aria-hidden="true" />
            )}
            {t('analytics_invoice_one_click')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('invoice_quick_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('invoice_quick_confirm_body', {
                period: statement.period,
                amount: amountLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('guided_back')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                void handleQuickInvoice()
              }}
            >
              {t('invoice_send')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
