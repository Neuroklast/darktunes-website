export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getBillingProfile, isBillingProfileComplete } from '@/lib/api/artistBillingProfiles'
import { listArtistInvoices } from '@/lib/api/artistInvoices'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getSalesStatementById } from '@/lib/api/salesStatements'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'
import { resolveLabelClientInfo } from '@/lib/portal/labelBilling'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { getTranslations } from 'next-intl/server'
import { InvoicesClient } from './_components/InvoicesClient'
import { getMetadataBrand, portalPageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelShortName } = await getMetadataBrand()
  return {
    title: portalPageTitle('Invoices', labelShortName),
    description: 'Create and manage invoices, including SOS-linked invoices.',
  }
}

function InvoicesSkeleton() {


  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

async function InvoicesContent({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; statement?: string }>
}) {

  const t = await getTranslations('portal')

  const { artistId, statement } = await searchParams

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist').catch(() => ({} as Record<string, boolean>))
  if (flags['artist.invoices'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('invoices_heading')}</h1>
        <p className="text-muted-foreground">The Invoices feature is currently unavailable.</p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const { invoices } = artist
    ? await listArtistInvoices(supabase, artist.id, 1, 200).catch(() => ({ invoices: [], total: 0 }))
    : { invoices: [] }
  const billingProfile = artist ? await getBillingProfile(supabase, artist.id).catch(() => null) : null
  const selectedStatement = artist && statement
    ? await getSalesStatementById(supabase, statement, artist.id).catch(() => null)
    : null
  const siteSettings = await getSiteSettings(supabase).catch(() => SITE_SETTINGS_DEFAULTS)
  const labelClient = resolveLabelClientInfo(siteSettings)

  return (
    <InvoicesClient
      artistId={artist?.id ?? ''}
      billingProfile={billingProfile}
      billingProfileComplete={isBillingProfileComplete(billingProfile)}
      labelClient={labelClient}
      invoices={invoices}
      statement={selectedStatement}
    />
  )
}

export default function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; statement?: string }>
}) {
  return (
    <Suspense fallback={<InvoicesSkeleton />}>
      <InvoicesContent searchParams={searchParams} />
    </Suspense>
  )
}
