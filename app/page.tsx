/**
 * app/page.tsx — Home page (React Server Component)
 *
 * Data is fetched server-side here using the Supabase server client.
 * Other catalogues stay tagged/cached, but scheduled news must use a fresh
 * publication-time query so that future news cannot be delayed by a stale TTL.
 *
 * The fetched data is passed as props to HomePageContent (Client Component)
 * following the IoC principle: RSC owns data fetching, client owns rendering.
 */

export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { HomePageContent } from './_components/HomePageContent'
import { SITE_SETTINGS_DEFAULTS } from '@/lib/api/siteSettings'

import {
  getCachedPublicReleases,
  getCachedPublicNews,
  getCachedPublicVideos,
  getCachedPublicConcerts,
  getCachedPublicArtists,
  getCachedSiteSettings,
} from '@/lib/cache/publicQueries'
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
// Page component
// ---------------------------------------------------------------------------

export default async function HomePage() {
  // Fetch all data in parallel on the server
  const [releases, news, videos, concerts, siteSettingsOrNull, artists] = await Promise.all([
    getCachedPublicReleases(),
    getCachedPublicNews(),
    getCachedPublicVideos(),
    getCachedPublicConcerts(),
    getCachedSiteSettings(),
    getCachedPublicArtists(),
  ])
  // HomePageContent needs the full object; the fallback is applied outside the
  // cache so an outage is never stored as "Music Label".
  const siteSettings = siteSettingsOrNull ?? SITE_SETTINGS_DEFAULTS

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
