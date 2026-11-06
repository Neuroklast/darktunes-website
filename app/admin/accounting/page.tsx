'use client'

/**
 * app/admin/accounting/page.tsx
 *
 * The Accounting section of the admin area.
 * Tab A: Generate Statements (SOS Generator embedded, artists from Supabase).
 * Tab B: Statement History (existing read-only StatementsManager).
 */

import { useTranslations } from 'next-intl'
import { AccountingPanel } from '@/components/admin/AccountingPanel'
import { AdminPageShell } from '../_components/AdminPageShell'

export default function AccountingPage() {
  const t = useTranslations('admin.accounting')

  return (
    <AdminPageShell
      title={t('pageTitle')}
      description={t('pageDescription')}
      fill
    >
      <AccountingPanel />
    </AdminPageShell>
  )
}