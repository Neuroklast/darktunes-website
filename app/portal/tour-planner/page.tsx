/**
 * app/portal/tour-planner/page.tsx — TRACK Tour Planner (Server Component)
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getToursByArtistId } from '@/lib/api/tours'
import { Skeleton } from '@/components/ui/skeleton'
import { TourPlannerShell } from './_components/TourPlannerShell'

function TourPlannerSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}

async function TourPlannerContent({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; mode?: string; tourId?: string; stopId?: string }>
}) {
  const t = await getTranslations('portal')
  const { artistId, mode, tourId, stopId } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist').catch(() => ({} as Record<string, boolean>))
  if (flags['artist.tour_planner'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('tour_planner_heading')}</h1>
        <p className="text-muted-foreground">{t('tour_planner_disabled')}</p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  if (!artist) return null

  const [tours, concerts] = await Promise.all([
    getToursByArtistId(supabase, artist.id).catch(() => []),
    getConcertsByArtistId(supabase, artist.id).catch(() => []),
  ])

  return (
    <TourPlannerShell
      artistId={artist.id}
      artistName={artist.name}
      initialTours={tours}
      concerts={concerts}
      initialViewMode={mode === 'tour' ? 'tour' : null}
      initialTourId={tourId ?? null}
      initialStopId={stopId ?? null}
    />
  )
}

export default function TourPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string; mode?: string; tourId?: string; stopId?: string }>
}) {
  return (
    <Suspense fallback={<TourPlannerSkeleton />}>
      <TourPlannerContent searchParams={searchParams} />
    </Suspense>
  )
}