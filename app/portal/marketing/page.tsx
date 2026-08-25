/**
 * app/portal/marketing/page.tsx — Marketing & Promo Links (Server Component)
 *
 * Fetches releases for the current artist and passes them to the SmartLinks
 * component.  Also fetches the artist's promo log entries for the timeline.
 */

export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolvePortalArtist } from '@/lib/api/artistProfiles'
import { getFeatureFlagsForRole } from '@/lib/api/featureFlags'
import { getAssetsByArtist } from '@/lib/api/assets'
import { getArtistAssets } from '@/lib/api/artistAssets'
import { getPromoLogEntries } from '@/lib/api/promoLog'
import { Skeleton } from '@/components/ui/skeleton'
import { SmartLinks } from './_components/SmartLinks'
import { PromoTimeline } from './_components/PromoTimeline'
import { getTranslations } from 'next-intl/server'

function MarketingSkeleton() {


  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}

async function MarketingContent({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {

  const t = await getTranslations('portal')

  const { artistId } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const artist = await resolvePortalArtist(supabase, user.id, artistId).catch(() => null)
  const flags = await getFeatureFlagsForRole(supabase, 'artist', await getRequestOrganizationId().catch(() => undefined)).catch(() => ({} as Record<string, boolean>))
  if (flags['artist.marketing'] === false) {
    return <p className="text-muted-foreground">Marketing module is currently disabled.</p>
  }

  const [assets, artistAssets, promoEntries] = artist
    ? await Promise.all([
        getAssetsByArtist(supabase, artist.id).catch(() => []),
        getArtistAssets(supabase, artist.id).catch(() => []),
        getPromoLogEntries(supabase, artist.id).catch(() => []),
      ])
    : [[], [], []]

  return (
    <div className="space-y-10">
      {/* Label marketing activity feed */}
      <section aria-labelledby="promo-log-heading">
        <h1 id="promo-log-heading" className="text-3xl font-bold mb-6">
          {t('promo_log_heading')}
        </h1>
        <PromoTimeline entries={promoEntries} />
      </section>

      {/* Smart links + asset management */}
      <SmartLinks assets={assets} artistAssets={artistAssets} />
    </div>
  )
}

export default function MarketingPage({ searchParams }: { searchParams: Promise<{ artistId?: string }> }) {
  return (
    <Suspense fallback={<MarketingSkeleton />}>
      <MarketingContent searchParams={searchParams} />
    </Suspense>
  )
}

