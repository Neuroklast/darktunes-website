/**
 * app/admin/invoices/page.tsx — Admin invoice inbox
 *
 * Every artist invoice (including free invoices without a statement), which
 * the period-scoped Settlement Center cannot show.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { AdminPageShell } from '../_components/AdminPageShell'
import { AdminInvoicesClient } from '@/components/admin/AdminInvoicesClient'
import { getArtists } from '@/lib/api/artists'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function AdminInvoicesPage() {
  const t = await getTranslations('admin.invoices')
  const supabase = await createServerSupabaseClient()
  const artists = await getArtists(supabase).catch(() => [])

  const options = artists
    .map((artist) => ({ id: artist.id, name: artist.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <AdminPageShell title={t('pageTitle')} description={t('pageDescription')} layout="list">
      <Suspense
        fallback={<div className="p-8 text-sm text-muted-foreground">{t('loading')}</div>}
      >
        <AdminInvoicesClient artists={options} />
      </Suspense>
    </AdminPageShell>
  )
}
