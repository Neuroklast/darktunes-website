/**
 * app/portal/spotify-trends/page.tsx — Public Spotify presence trends
 *
 * Separate from SOS statement analytics. Loads listener metrics + track play
 * snapshots only.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getListenerMetricsByArtistId } from '@/lib/api/artistListenerMetrics'
import { getTrackPlaySnapshotsByArtistId } from '@/lib/api/spotifyTrackPlaySnapshots'
import { getStreamingStatsByArtistId } from '@/lib/api/streamingStats'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { Skeleton } from '@/components/ui/skeleton'
import { SpotifyTrendsPageClient } from './_components/SpotifyTrendsPageClient'
import { getTranslations } from 'next-intl/server'

function TrendsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

async function SpotifyTrendsContent({
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

  if (!user) return null

  const flags = await getFeatureFlagsForRole(supabase, 'artist').catch(
    () => ({} as Record<string, boolean>),
  )
  if (flags['artist.analytics'] === false) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('spotify_trends_heading')}</h1>
        <p className="text-muted-foreground">{t('analytics_unavailable')}</p>
      </div>
    )
  }

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)

  const [listenerMetrics, trackSnapshots, sosStats, releases] = await Promise.all([
    artist ? getListenerMetricsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist
      ? getTrackPlaySnapshotsByArtistId(supabase, artist.id).catch(() => [])
      : Promise.resolve([]),
    artist ? getStreamingStatsByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
    artist ? getReleasesByArtistId(supabase, artist.id).catch(() => []) : Promise.resolve([]),
  ])

  const releaseTitles: Record<string, string> = {}
  for (const r of releases) {
    releaseTitles[r.id] = r.title
  }

  return (
    <SpotifyTrendsPageClient
      artistName={artist?.name ?? ''}
      listenerMetrics={listenerMetrics}
      trackSnapshots={trackSnapshots}
      releaseTitles={releaseTitles}
      sosStats={sosStats}
    />
  )
}

export default function SpotifyTrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>
}) {
  return (
    <Suspense fallback={<TrendsSkeleton />}>
      <SpotifyTrendsContent searchParams={searchParams} />
    </Suspense>
  )
}
