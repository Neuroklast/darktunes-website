/**
 * app/portal/page.tsx — Artist Portal overview (Server Component)
 *
 * Dashboard overview: shows artist name, quick links to all portal sections.
 * Data is fetched server-side and passed as props to the client leaf.
 */

export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getArtistProfileByArtistId, resolvePortalArtist } from '@/lib/api/artistProfiles'
import { countAssetsByArtist } from '@/lib/api/assets'
import { getStreamingStatsByArtistId, getAggregatedStreamsByPlatform } from '@/lib/api/streamingStats'
import { getSalesStatementsByArtistId } from '@/lib/api/salesStatements'
import { getPromoImpactByArtistId } from '@/lib/api/promoImpact'
import { getArtistSettlementSummary } from '@/lib/api/settlementLedger'
import { computeOverviewInsights } from '@/lib/analytics/overviewInsights'
import { getReleasesByArtistId } from '@/lib/api/releases'
import { getConcertsByArtistId } from '@/lib/api/concerts'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { calcProfileCompletion } from '@/lib/portal/profileCompletion'
import { safeHeadCount } from '@/lib/portal/safeQuery'
import { PortalOverview } from './_components/PortalOverview'
export default async function PortalPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  const { artistId } = await searchParams

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const featureFlags = await getFeatureFlagsForRole(supabase, 'artist').catch(
    () => ({} as Record<string, boolean>),
  )
  const statementsEnabled = featureFlags['artist.statements'] !== false
  const analyticsEnabled = featureFlags['artist.analytics'] !== false

  const [
    stats,
    releases,
    concerts,
    openSubmissionCount,
    artistProfile,
    statementCount,
    assetCount,
    tourCount,
    statements,
    promoImpacts,
    settlementSummary,
  ] = artist
    ? await Promise.all([
        getStreamingStatsByArtistId(supabase, artist.id).catch(() => []),
        getReleasesByArtistId(supabase, artist.id).catch(() => []),
        getConcertsByArtistId(supabase, artist.id).catch(() => []),
        safeHeadCount(
          supabase
            .from('release_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artist.id)
            .in('status', ['received', 'reviewed']),
        ),
        getArtistProfileByArtistId(supabase, artist.id).catch(() => null),
        safeHeadCount(
          supabase
            .from('sales_statements')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artist.id),
        ),
        countAssetsByArtist(supabase, artist.id).catch(() => 0),
        safeHeadCount(
          supabase
            .from('tours')
            .select('id', { count: 'exact', head: true })
            .eq('artist_id', artist.id)
            .eq('archived', false),
        ),
        getSalesStatementsByArtistId(supabase, artist.id).catch(() => []),
        getPromoImpactByArtistId(supabase, artist.id).catch(() => []),
        statementsEnabled
          ? getArtistSettlementSummary(supabase, artist.id).catch(() => null)
          : Promise.resolve(null),
      ])
    : [[], [], [], 0, null, 0, 0, 0, [], [], null]

  const aggregates = getAggregatedStreamsByPlatform(stats)
  const totalStreams = aggregates.reduce((sum, p) => sum + p.totalStreams, 0)

  const { score: completionScore, missing: missingFields } = artist
    ? calcProfileCompletion(artist, artistProfile)
    : { score: 0, missing: [] }

  const overviewInsights = computeOverviewInsights({
    stats,
    statements,
    settlement: settlementSummary,
    promoImpacts,
    analyticsEnabled,
    artistId: artist?.id ?? null,
  })

  return (
    <PortalOverview
      artistId={artist?.id ?? null}
      artistName={artist?.name ?? null}
      profileImageUrl={artist?.imageUrl ?? null}
      totalStreams={totalStreams}
      releaseCount={releases.length}
      upcomingShowCount={concerts.length}
      openSubmissionCount={openSubmissionCount}
      statementCount={statementCount}
      assetCount={assetCount}
      tourCount={tourCount}
      featureFlags={featureFlags}
      completionScore={completionScore}
      missingFields={missingFields}
      overviewInsights={overviewInsights}
      artistSlug={artist?.slug ?? null}
    />
  )
}
