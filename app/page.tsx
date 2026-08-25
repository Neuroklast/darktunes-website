/**
 * app/page.tsx — Home page (React Server Component)
 *
 * Data is fetched server-side here using the Supabase server client.
 * Next.js 15 no longer caches fetch/GET by default, so we explicitly wrap
 * queries in unstable_cache with revalidation tags and a 60-second TTL.
 * This prevents per-request Supabase queries while keeping data fresh.
 *
 * The fetched data is passed as props to HomePageContent (Client Component)
 * following the IoC principle: RSC owns data fetching, client owns rendering.
 */

import { unstable_cache } from 'next/cache'
import type { Metadata } from 'next'
import { HomePageContent } from './_components/HomePageContent'
import { getSiteSettings, SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'

import {
  getCachedPublicReleases,
  getCachedPublicNews,
  getCachedPublicVideos,
  getCachedPublicConcerts,
  getCachedPublicArtists,
} from '@/lib/cache/publicQueries'
import { getRequestOrganizationId } from '@/lib/organizations/requestContext'
import { createPublicSupabaseClient } from '@/lib/supabase/publicClient'
import type { SiteSettings } from '@/types'
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  serializeJsonLd,
} from '@/lib/seo/jsonld'

/**
 * Homepage-specific metadata. Inherits base title/description/OG from the root
 * layout's generateMetadata(), and adds homepage-specific Twitter card tags.
 */
export const metadata: Metadata = {
  twitter: {
    card: 'summary_large_image',
  },
}

// ---------------------------------------------------------------------------
// Home page uses a richer fallback for site settings (non-nullable SiteSettings)
// because HomePageContent requires the full object.
// For other RSC pages the nullable getCachedSiteSettings from publicQueries.ts
// is sufficient — those components use optional chaining on every field.
// ---------------------------------------------------------------------------

function getCachedHomeSiteSettings(organizationId: string): Promise<SiteSettings> {
  return unstable_cache(
    async (): Promise<SiteSettings> => {
      return getSiteSettings(createPublicSupabaseClient(), organizationId).catch(
        (): SiteSettings => SITE_SETTINGS_DEFAULTS,
      )
    },
    ['site-settings', organizationId],
    { revalidate: 60, tags: ['site-settings', `o:${organizationId}:site-settings`] },
  )()
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function HomePage() {
  const orgId = await getRequestOrganizationId()
  // Fetch all data in parallel on the server
  const [releases, news, videos, concerts, siteSettings, artists] = await Promise.all([
    getCachedPublicReleases(orgId),
    getCachedPublicNews(orgId),
    getCachedPublicVideos({ organizationId: orgId }),
    getCachedPublicConcerts(orgId),
    getCachedHomeSiteSettings(orgId),
    getCachedPublicArtists(orgId),
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildOrganizationSchema({ siteSettings })) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildWebSiteSchema(siteSettings.labelName)) }}
      />
      <HomePageContent
        releases={releases}
        news={news}
        videos={videos}
        concerts={concerts}
        siteSettings={siteSettings}
        artists={artists}
      />
    </>
  )
}
