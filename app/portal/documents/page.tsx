/**
 * app/portal/documents/page.tsx — Document Vault (Server Component)
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { listArtistDocuments } from '@/lib/api/artistDocuments'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { Skeleton } from '@/components/ui/skeleton'
import { DocumentVault } from './_components/DocumentVault'
import { getTranslations } from 'next-intl/server'

function DocumentsSkeleton() {


  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

async function DocumentsContent({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {

  const t = await getTranslations('portal')

  const { artistId } = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>))
  if (flags['artist.documents'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('documents_heading')}</h1>
        <p className="text-muted-foreground">
          The Document Vault feature is currently unavailable.
        </p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const documents = artist
    ? await listArtistDocuments(supabase, artist.id).catch(() => [])
    : []

  return (
    <DocumentVault
      documents={documents}
      artistId={artist?.id ?? ''}
    />
  )
}

export default function DocumentsPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  return (
    <Suspense fallback={<DocumentsSkeleton />}>
      <DocumentsContent searchParams={searchParams} />
    </Suspense>
  )
}
