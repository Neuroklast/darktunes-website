export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createServerSupabaseClient, createServiceRoleSupabaseClient } from '@/lib/supabase/server'
import { getBillingProfile, isBillingProfileComplete } from '@/lib/api/artistBillingProfiles'
import { listArtistInvoices } from '@/lib/api/artistInvoices'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getSalesStatementsByArtistId } from '@/lib/api/salesStatements'
import { getStatementProvenanceByStatementIds } from '@/lib/api/distributorImportBatches'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { Skeleton } from '@/components/ui/skeleton'
import { StatementsTable } from './_components/StatementsTable'
import { getTranslations } from 'next-intl/server'
import { getMetadataBrand, portalPageTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelShortName } = await getMetadataBrand()
  return {
    title: portalPageTitle('Statements', labelShortName),
    description: 'Review royalty statements and create linked invoices.',
  }
}

function StatementsSkeleton() {


  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

async function StatementsContent({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {

  const t = await getTranslations('portal')

  const { artistId } = await searchParams

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist').catch(() => ({} as Record<string, boolean>))
  if (flags['artist.statements'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('statements_heading')}</h1>
        <p className="text-muted-foreground">
          The Statement of Sales feature is currently unavailable. Please contact the label for more information.
        </p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const [statements, invoiceList, billingProfile] = await Promise.all([
    artist ? getSalesStatementsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist
      ? listArtistInvoices(supabase, artist.id, 1, 200).catch(() => ({ invoices: [], total: 0 }))
      : Promise.resolve({ invoices: [], total: 0 }),
    artist ? getBillingProfile(supabase, artist.id).catch(() => null) : Promise.resolve(null),
  ])

  // Bronze batches are label infrastructure; load provenance after membership via service role
  // (RLS also allows artist SELECT on linked batches once reset.sql is applied).
  const provenanceByStatementId =
    artist && statements.length > 0
      ? await createServiceRoleSupabaseClient()
          .then((adminDb) => getStatementProvenanceByStatementIds(adminDb, statements))
          .catch(() => ({}))
      : {}

  return (
    <StatementsTable
      artistId={artist?.id}
      billingProfile={billingProfile}
      billingProfileComplete={isBillingProfileComplete(billingProfile)}
      invoicedStatementIds={invoiceList.invoices.flatMap((invoice) =>
        invoice.statementId ? [invoice.statementId] : [],
      )}
      statements={statements}
      provenanceByStatementId={provenanceByStatementId}
    />
  )
}

export default function StatementsPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  return (
    <Suspense fallback={<StatementsSkeleton />}>
      <StatementsContent searchParams={searchParams} />
    </Suspense>
  )
}
