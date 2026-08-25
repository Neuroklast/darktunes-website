export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getArtistProfileByArtistId,
  resolvePortalArtist,
} from '@/lib/api/artistProfiles'
import { getFanPageDocumentState } from '@/lib/api/fanPageDocument'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getVideosByArtistId } from '@/lib/api/videos'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { Skeleton } from '@/components/ui/skeleton'
import { FanPageBuilderClient } from './_components/FanPageBuilderClient'
import type { Metadata } from 'next'
import { getMetadataBrand, portalBuilderTitle } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const { labelShortName } = await getMetadataBrand()
  return {
    title: portalBuilderTitle('Fan Page Builder', labelShortName),
    description: 'Build and publish your artist fan page',
  }
}

function FanPageBuilderSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[480px] w-full" />
    </div>
  )
}

async function FanPageBuilderContent({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  const t = await getTranslations('portal')
  const { artistId } = await searchParams

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/portal/login')

  const flags = await getFeatureFlagsForRole(supabase, 'artist', await getRequestOrganizationId().catch(() => undefined)).catch(
    (): Record<string, boolean> => ({}),
  )
  if (flags['artist.fan_page'] === false) notFound()

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  if (!artist) {
    return <p className="text-muted-foreground">{t('notLinked')}</p>
  }

  const profile = await getArtistProfileByArtistId(supabase, artist.id).catch(() => null)

  const [state, releases, concerts, videos] = await Promise.all([
    getFanPageDocumentState(supabase, artist.id, artist, profile),
    getReleasesByArtistId(supabase, artist.id).catch(() => []),
    getConcertsByArtistId(supabase, artist.id).catch(() => []),
    getVideosByArtistId(supabase, artist.id).catch(() => []),
  ])

  return (
    <FanPageBuilderClient
      artistId={artist.id}
      artist={artist}
      initialDocument={state.document}
      documentVersion={state.documentVersion}
      publishStatus={state.publishStatus}
      releases={releases}
      concerts={concerts}
      videos={videos}
    />
  )
}

export default function FanPageBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  return (
    <Suspense fallback={<FanPageBuilderSkeleton />}>
      <FanPageBuilderContent searchParams={searchParams} />
    </Suspense>
  )
}